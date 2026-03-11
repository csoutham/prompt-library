import type { FolderRecord, PromptRecord, SyncStatus } from "./prompt-store";
import { CLOUDKIT_ZONE_NAME } from "./cloudkit-config";

export const CLOUDKIT_FOLDER_RECORD_TYPE = "PromptFolder";
export const CLOUDKIT_PROMPT_RECORD_TYPE = "Prompt";

export type CloudKitRecordZoneName = typeof CLOUDKIT_ZONE_NAME;

export type CloudKitFolderFields = {
	folderId: string;
	name: string;
	parentId: string | null;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
	syncStatus: SyncStatus;
};

export type CloudKitPromptFields = {
	promptId: string;
	title: string;
	folderId: string;
	bodyMarkdown: string;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
	syncStatus: SyncStatus;
};

export type CloudKitFolderRecord = {
	recordType: typeof CLOUDKIT_FOLDER_RECORD_TYPE;
	recordName: string;
	zoneName: CloudKitRecordZoneName;
	fields: CloudKitFolderFields;
};

export type CloudKitPromptRecord = {
	recordType: typeof CLOUDKIT_PROMPT_RECORD_TYPE;
	recordName: string;
	zoneName: CloudKitRecordZoneName;
	fields: CloudKitPromptFields;
};

export type CloudKitDeleteRecord = {
	recordType: typeof CLOUDKIT_FOLDER_RECORD_TYPE | typeof CLOUDKIT_PROMPT_RECORD_TYPE;
	recordName: string;
	zoneName: CloudKitRecordZoneName;
	deletedAt: string;
};

export type CloudKitPushPlan = {
	generatedAt: string;
	foldersToSave: CloudKitFolderRecord[];
	promptsToSave: CloudKitPromptRecord[];
	recordsToDelete: CloudKitDeleteRecord[];
};

export type CloudKitPullPayload = {
	folders: CloudKitFolderRecord[];
	prompts: CloudKitPromptRecord[];
	deletedRecords: CloudKitDeleteRecord[];
};

export type CloudKitPullResult = {
	appliedFolders: number;
	appliedPrompts: number;
	appliedDeletes: number;
	conflictCopiesCreated: number;
};

export type CloudKitRuntimeStatus = {
	available: boolean;
	accountStatus: string;
	syncInFlight: boolean;
	lastSyncAt: string | null;
	lastError: string | null;
};

export function folderRecordName(folder: FolderRecord): string {
	return folder.cloudKitRecordName ?? `folder.${folder.id}`;
}

export function promptRecordName(prompt: PromptRecord): string {
	return prompt.cloudKitRecordName ?? `prompt.${prompt.id}`;
}

export function folderToCloudKitRecord(folder: FolderRecord): CloudKitFolderRecord {
	return {
		recordType: CLOUDKIT_FOLDER_RECORD_TYPE,
		recordName: folderRecordName(folder),
		zoneName: CLOUDKIT_ZONE_NAME,
		fields: {
			folderId: folder.id,
			name: folder.name,
			parentId: folder.parentId,
			createdAt: folder.createdAt,
			updatedAt: folder.updatedAt,
			deletedAt: folder.deletedAt,
			syncStatus: folder.syncStatus,
		},
	};
}

export function promptToCloudKitRecord(prompt: PromptRecord): CloudKitPromptRecord {
	return {
		recordType: CLOUDKIT_PROMPT_RECORD_TYPE,
		recordName: promptRecordName(prompt),
		zoneName: CLOUDKIT_ZONE_NAME,
		fields: {
			promptId: prompt.id,
			title: prompt.title,
			folderId: prompt.folderId,
			bodyMarkdown: prompt.bodyMarkdown,
			createdAt: prompt.createdAt,
			updatedAt: prompt.updatedAt,
			deletedAt: prompt.deletedAt,
			syncStatus: prompt.syncStatus,
		},
	};
}

export function folderToCloudKitDelete(folder: FolderRecord): CloudKitDeleteRecord {
	return {
		recordType: CLOUDKIT_FOLDER_RECORD_TYPE,
		recordName: folderRecordName(folder),
		zoneName: CLOUDKIT_ZONE_NAME,
		deletedAt: folder.deletedAt ?? folder.updatedAt,
	};
}

export function promptToCloudKitDelete(prompt: PromptRecord): CloudKitDeleteRecord {
	return {
		recordType: CLOUDKIT_PROMPT_RECORD_TYPE,
		recordName: promptRecordName(prompt),
		zoneName: CLOUDKIT_ZONE_NAME,
		deletedAt: prompt.deletedAt ?? prompt.updatedAt,
	};
}

export function cloudKitFolderToRecord(record: CloudKitFolderRecord): FolderRecord {
	return {
		id: record.fields.folderId,
		name: record.fields.name,
		parentId: record.fields.parentId,
		createdAt: record.fields.createdAt,
		updatedAt: record.fields.updatedAt,
		deletedAt: record.fields.deletedAt,
		lastSyncedAt: record.fields.updatedAt,
		syncStatus: record.fields.syncStatus,
		cloudKitRecordName: record.recordName,
	};
}

export function cloudKitPromptToRecord(record: CloudKitPromptRecord): PromptRecord {
	return {
		id: record.fields.promptId,
		title: record.fields.title,
		folderId: record.fields.folderId,
		bodyMarkdown: record.fields.bodyMarkdown,
		createdAt: record.fields.createdAt,
		updatedAt: record.fields.updatedAt,
		deletedAt: record.fields.deletedAt,
		lastSyncedAt: record.fields.updatedAt,
		syncStatus: record.fields.syncStatus,
		cloudKitRecordName: record.recordName,
	};
}
