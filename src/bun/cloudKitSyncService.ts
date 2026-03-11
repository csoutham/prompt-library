import type {
	CloudKitSyncState,
	FolderRecord,
	PromptRecord,
	PromptRepository,
	SyncStateStore,
} from "../shared/prompt-store";
import {
	type CloudKitPullPayload,
	type CloudKitPullResult,
	type CloudKitPushPlan,
	cloudKitFolderToRecord,
	cloudKitPromptToRecord,
	folderToCloudKitDelete,
	folderToCloudKitRecord,
	promptToCloudKitDelete,
	promptToCloudKitRecord,
} from "../shared/cloudkit";

export class CloudKitSyncService {
	constructor(
		private readonly repository: PromptRepository,
		private readonly syncStateStore: SyncStateStore,
	) {}

	async buildPushPlan(): Promise<CloudKitPushPlan> {
		const [snapshot] = await Promise.all([
			this.repository.exportSnapshot({ includeDeleted: true }),
			this.syncStateStore.read(),
		]);

		const foldersToSave = snapshot.folders
			.filter((folder) => folder.deletedAt === null && shouldPushRecord(folder.syncStatus))
			.map(folderToCloudKitRecord);
		const promptsToSave = snapshot.prompts
			.filter((prompt) => prompt.deletedAt === null && shouldPushRecord(prompt.syncStatus))
			.map(promptToCloudKitRecord);
		const recordsToDelete = [
			...snapshot.prompts
				.filter((prompt) => prompt.deletedAt !== null && hasCloudKitIdentity(prompt))
				.map(promptToCloudKitDelete),
			...snapshot.folders
				.filter((folder) => folder.deletedAt !== null && hasCloudKitIdentity(folder))
				.map(folderToCloudKitDelete),
		];

		return {
			generatedAt: new Date().toISOString(),
			foldersToSave,
			promptsToSave,
			recordsToDelete,
		};
	}

	async markSyncCompleted(nextState: Partial<CloudKitSyncState> = {}): Promise<CloudKitSyncState> {
		const currentState = await this.syncStateStore.read();
		const syncedAt = nextState.lastSyncAt ?? new Date().toISOString();

		return this.syncStateStore.write({
			...currentState,
			...nextState,
			version: 1,
			lastSyncAt: syncedAt,
		});
	}

	async acknowledgePushPlan(
		plan: CloudKitPushPlan,
		nextState: Partial<CloudKitSyncState> = {},
	): Promise<CloudKitSyncState> {
		const snapshot = await this.repository.exportSnapshot({ includeDeleted: true });
		const folders = snapshot.folders.map((folder) => {
			const pushedRecord = plan.foldersToSave.find(
				(entry) => entry.fields.folderId === folder.id,
			);
			if (!pushedRecord) {
				return folder;
			}

			return markFolderSynced(
				{
					...folder,
					cloudKitRecordName: pushedRecord.recordName,
				},
				plan.generatedAt,
			);
		});
		const prompts = snapshot.prompts.map((prompt) => {
			const pushedRecord = plan.promptsToSave.find(
				(entry) => entry.fields.promptId === prompt.id,
			);
			if (pushedRecord) {
				return markPromptSynced(
					{
						...prompt,
						cloudKitRecordName: pushedRecord.recordName,
					},
					plan.generatedAt,
				);
			}

			const deletedRecord = plan.recordsToDelete.find(
				(entry) => entry.recordType === "Prompt" && entry.recordName === prompt.cloudKitRecordName,
			);
			if (deletedRecord) {
				return markPromptSynced(prompt, plan.generatedAt);
			}

			return prompt;
		});

		await this.repository.importSnapshot({
			version: 1,
			exportedAt: plan.generatedAt,
			folders,
			prompts,
		});

		return this.markSyncCompleted(nextState);
	}

	async applyPullPayload(payload: CloudKitPullPayload): Promise<CloudKitPullResult> {
		const snapshot = await this.repository.exportSnapshot({ includeDeleted: true });
		const syncedAt = new Date().toISOString();
		const folders = [...snapshot.folders];
		const prompts = [...snapshot.prompts];
		let conflictCopiesCreated = 0;
		let appliedFolders = 0;
		let appliedPrompts = 0;
		let appliedDeletes = 0;

		for (const remoteFolderRecord of payload.folders) {
			const remoteFolder = markFolderSynced(cloudKitFolderToRecord(remoteFolderRecord), syncedAt);
			const localIndex = folders.findIndex((entry) => entry.id === remoteFolder.id);
			if (localIndex === -1) {
				folders.push(remoteFolder);
				appliedFolders += 1;
				continue;
			}

			const localFolder = folders[localIndex]!;
			if (shouldReplaceLocalFolder(localFolder, remoteFolder)) {
				folders[localIndex] = remoteFolder;
				appliedFolders += 1;
			}
		}

		for (const remotePromptRecord of payload.prompts) {
			const remotePrompt = markPromptSynced(cloudKitPromptToRecord(remotePromptRecord), syncedAt);
			const localIndex = prompts.findIndex((entry) => entry.id === remotePrompt.id);
			if (localIndex === -1) {
				prompts.push(remotePrompt);
				appliedPrompts += 1;
				continue;
			}

			const localPrompt = prompts[localIndex]!;
			if (shouldCreateConflictCopy(localPrompt, remotePrompt)) {
				prompts.push(createConflictCopy(localPrompt));
				conflictCopiesCreated += 1;
			}

			if (shouldReplaceLocalPrompt(localPrompt, remotePrompt)) {
				prompts[localIndex] = remotePrompt;
				appliedPrompts += 1;
			}
		}

		for (const deletedRecord of payload.deletedRecords) {
			if (deletedRecord.recordType === "Prompt") {
				const localIndex = prompts.findIndex(
					(entry) => entry.cloudKitRecordName === deletedRecord.recordName,
				);
				if (localIndex !== -1 && shouldApplyRemoteDelete(prompts[localIndex]!, deletedRecord.deletedAt)) {
					prompts[localIndex] = markPromptDeleted(prompts[localIndex]!, deletedRecord.deletedAt, syncedAt);
					appliedDeletes += 1;
				}
				continue;
			}

			const localIndex = folders.findIndex(
				(entry) => entry.cloudKitRecordName === deletedRecord.recordName,
			);
			if (localIndex !== -1 && shouldApplyRemoteDelete(folders[localIndex]!, deletedRecord.deletedAt)) {
				folders[localIndex] = markFolderDeleted(folders[localIndex]!, deletedRecord.deletedAt, syncedAt);
				appliedDeletes += 1;
			}
		}

		await this.repository.importSnapshot({
			version: 1,
			exportedAt: syncedAt,
			folders,
			prompts,
		});

		return {
			appliedFolders,
			appliedPrompts,
			appliedDeletes,
			conflictCopiesCreated,
		};
	}
}

function shouldPushRecord(syncStatus: string): boolean {
	return syncStatus === "local" || syncStatus === "modified" || syncStatus === "conflict";
}

function hasCloudKitIdentity(record: { cloudKitRecordName: string | null }): boolean {
	return Boolean(record.cloudKitRecordName);
}

function shouldReplaceLocalFolder(localFolder: FolderRecord, remoteFolder: FolderRecord): boolean {
	return remoteFolder.updatedAt >= localFolder.updatedAt;
}

function shouldReplaceLocalPrompt(localPrompt: PromptRecord, remotePrompt: PromptRecord): boolean {
	return remotePrompt.updatedAt >= localPrompt.updatedAt;
}

function shouldCreateConflictCopy(localPrompt: PromptRecord, remotePrompt: PromptRecord): boolean {
	return (
		(localPrompt.syncStatus === "local" ||
			localPrompt.syncStatus === "modified" ||
			localPrompt.syncStatus === "conflict") &&
		localPrompt.deletedAt === null &&
		remotePrompt.deletedAt === null &&
		remotePrompt.updatedAt > localPrompt.updatedAt &&
		(localPrompt.title !== remotePrompt.title ||
			localPrompt.bodyMarkdown !== remotePrompt.bodyMarkdown)
	);
}

function shouldApplyRemoteDelete(
	record: FolderRecord | PromptRecord,
	remoteDeletedAt: string,
): boolean {
	return remoteDeletedAt >= record.updatedAt;
}

function markFolderSynced(folder: FolderRecord, syncedAt: string): FolderRecord {
	return {
		...folder,
		lastSyncedAt: syncedAt,
		syncStatus: "synced",
	};
}

function markPromptSynced(prompt: PromptRecord, syncedAt: string): PromptRecord {
	return {
		...prompt,
		lastSyncedAt: syncedAt,
		syncStatus: "synced",
	};
}

function markFolderDeleted(folder: FolderRecord, deletedAt: string, syncedAt: string): FolderRecord {
	return {
		...folder,
		deletedAt,
		updatedAt: deletedAt,
		lastSyncedAt: syncedAt,
		syncStatus: "synced",
	};
}

function markPromptDeleted(prompt: PromptRecord, deletedAt: string, syncedAt: string): PromptRecord {
	return {
		...prompt,
		deletedAt,
		updatedAt: deletedAt,
		lastSyncedAt: syncedAt,
		syncStatus: "synced",
	};
}

function createConflictCopy(prompt: PromptRecord): PromptRecord {
	const now = new Date().toISOString();
	return {
		...prompt,
		id: crypto.randomUUID(),
		title: `${prompt.title} (Conflict Copy)`,
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
		lastSyncedAt: null,
		syncStatus: "local",
		cloudKitRecordName: null,
	};
}
