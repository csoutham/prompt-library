import { join } from "node:path";
import type {
	BootstrapPayload,
	CloudKitSyncState,
	FolderRecord,
	PromptLibrarySnapshot,
	PromptRecord,
	PromptRepository,
	PromptSummary,
	RecordQueryOptions,
} from "../shared/prompt-store";
import type {
	CloudKitPullPayload,
	CloudKitPullResult,
	CloudKitPushPlan,
} from "../shared/cloudkit";
import { CloudKitSyncService } from "./cloudKitSyncService";
import { FilePromptRepository } from "./filePromptRepository";
import { FileSyncStateStore } from "./syncStateStore";

export { PromptStoreError } from "./filePromptRepository";
export { FilePromptRepository } from "./filePromptRepository";
export { FileSyncStateStore } from "./syncStateStore";
export { CloudKitSyncService } from "./cloudKitSyncService";

export class PromptStore implements PromptRepository {
	readonly repository: FilePromptRepository;
	readonly syncStateStore: FileSyncStateStore;
	readonly cloudKitSyncService: CloudKitSyncService;

	constructor(rootDir: string) {
		this.repository = new FilePromptRepository(rootDir);
		this.syncStateStore = new FileSyncStateStore(join(rootDir, ".cloudkit"));
		this.cloudKitSyncService = new CloudKitSyncService(
			this.repository,
			this.syncStateStore,
		);
	}

	bootstrap(options?: RecordQueryOptions): Promise<BootstrapPayload> {
		return this.repository.bootstrap(options);
	}

	listFolders(options?: RecordQueryOptions): Promise<FolderRecord[]> {
		return this.repository.listFolders(options);
	}

	listPrompts(folderId: string, options?: RecordQueryOptions): Promise<PromptSummary[]> {
		return this.repository.listPrompts(folderId, options);
	}

	getPrompt(promptId: string, options?: RecordQueryOptions): Promise<PromptRecord | null> {
		return this.repository.getPrompt(promptId, options);
	}

	createFolder(name: string, parentId: string | null): Promise<FolderRecord> {
		return this.repository.createFolder(name, parentId);
	}

	renameFolder(folderId: string, name: string): Promise<FolderRecord> {
		return this.repository.renameFolder(folderId, name);
	}

	deleteFolder(folderId: string): Promise<void> {
		return this.repository.deleteFolder(folderId);
	}

	createPrompt(folderId: string, title?: string): Promise<PromptRecord> {
		return this.repository.createPrompt(folderId, title);
	}

	savePrompt(promptId: string, title: string, bodyMarkdown: string): Promise<PromptRecord> {
		return this.repository.savePrompt(promptId, title, bodyMarkdown);
	}

	movePrompt(promptId: string, folderId: string): Promise<PromptRecord> {
		return this.repository.movePrompt(promptId, folderId);
	}

	renamePrompt(promptId: string, title: string): Promise<PromptRecord> {
		return this.repository.renamePrompt(promptId, title);
	}

	deletePrompt(promptId: string): Promise<void> {
		return this.repository.deletePrompt(promptId);
	}

	searchPrompts(query: string, options?: RecordQueryOptions): Promise<PromptSummary[]> {
		return this.repository.searchPrompts(query, options);
	}

	exportSnapshot(options?: RecordQueryOptions): Promise<PromptLibrarySnapshot> {
		return this.repository.exportSnapshot(options);
	}

	importSnapshot(snapshot: PromptLibrarySnapshot): Promise<void> {
		return this.repository.importSnapshot(snapshot);
	}

	readSyncState(): Promise<CloudKitSyncState> {
		return this.syncStateStore.read();
	}

	writeSyncState(state: CloudKitSyncState): Promise<CloudKitSyncState> {
		return this.syncStateStore.write(state);
	}

	resetSyncState(): Promise<CloudKitSyncState> {
		return this.syncStateStore.reset();
	}

	buildCloudKitPushPlan(): Promise<CloudKitPushPlan> {
		return this.cloudKitSyncService.buildPushPlan();
	}

	markCloudKitSyncCompleted(
		nextState: Partial<CloudKitSyncState> = {},
	): Promise<CloudKitSyncState> {
		return this.cloudKitSyncService.markSyncCompleted(nextState);
	}

	applyCloudKitPullPayload(payload: CloudKitPullPayload): Promise<CloudKitPullResult> {
		return this.cloudKitSyncService.applyPullPayload(payload);
	}

	acknowledgeCloudKitPushPlan(
		plan: CloudKitPushPlan,
		nextState: Partial<CloudKitSyncState> = {},
	): Promise<CloudKitSyncState> {
		return this.cloudKitSyncService.acknowledgePushPlan(plan, nextState);
	}
}
