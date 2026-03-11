export type SyncStatus = "local" | "modified" | "synced" | "conflict";

export type SyncMetadata = {
	deletedAt: string | null;
	lastSyncedAt: string | null;
	syncStatus: SyncStatus;
	cloudKitRecordName: string | null;
};

export type FolderRecord = {
	id: string;
	name: string;
	parentId: string | null;
	createdAt: string;
	updatedAt: string;
} & SyncMetadata;

export type PromptRecord = {
	id: string;
	title: string;
	folderId: string;
	bodyMarkdown: string;
	createdAt: string;
	updatedAt: string;
} & SyncMetadata;

export type PromptSummary = Omit<PromptRecord, "bodyMarkdown"> & {
	excerpt: string;
};

export type BootstrapPayload = {
	folders: FolderRecord[];
	prompts: PromptSummary[];
};

export type PromptLibrarySnapshot = {
	version: 1;
	exportedAt: string;
	folders: FolderRecord[];
	prompts: PromptRecord[];
};

export type CloudKitSyncState = {
	version: 1;
	databaseChangeToken: string | null;
	zoneChangeTokens: Record<string, string | null>;
	lastSyncAt: string | null;
	lastFullSyncAt: string | null;
};

export type RecordQueryOptions = {
	includeDeleted?: boolean;
};

export interface PromptRepository {
	bootstrap(options?: RecordQueryOptions): Promise<BootstrapPayload>;
	listFolders(options?: RecordQueryOptions): Promise<FolderRecord[]>;
	listPrompts(folderId: string, options?: RecordQueryOptions): Promise<PromptSummary[]>;
	getPrompt(promptId: string, options?: RecordQueryOptions): Promise<PromptRecord | null>;
	createFolder(name: string, parentId: string | null): Promise<FolderRecord>;
	renameFolder(folderId: string, name: string): Promise<FolderRecord>;
	deleteFolder(folderId: string): Promise<void>;
	createPrompt(folderId: string, title?: string): Promise<PromptRecord>;
	savePrompt(promptId: string, title: string, bodyMarkdown: string): Promise<PromptRecord>;
	movePrompt(promptId: string, folderId: string): Promise<PromptRecord>;
	renamePrompt(promptId: string, title: string): Promise<PromptRecord>;
	deletePrompt(promptId: string): Promise<void>;
	searchPrompts(query: string, options?: RecordQueryOptions): Promise<PromptSummary[]>;
	exportSnapshot(options?: RecordQueryOptions): Promise<PromptLibrarySnapshot>;
	importSnapshot(snapshot: PromptLibrarySnapshot): Promise<void>;
}

export interface SyncStateStore {
	read(): Promise<CloudKitSyncState>;
	write(state: CloudKitSyncState): Promise<CloudKitSyncState>;
	reset(): Promise<CloudKitSyncState>;
}

export type PromptStoreRpcSchema = {
	bun: {
		requests: {
			bootstrap: {
				params: undefined;
				response: BootstrapPayload;
			};
			listFolders: {
				params: undefined;
				response: FolderRecord[];
			};
			listPrompts: {
				params: { folderId: string };
				response: PromptSummary[];
			};
			getPrompt: {
				params: { promptId: string };
				response: PromptRecord | null;
			};
			createFolder: {
				params: { name: string; parentId: string | null };
				response: FolderRecord;
			};
			renameFolder: {
				params: { folderId: string; name: string };
				response: FolderRecord;
			};
			deleteFolder: {
				params: { folderId: string };
				response: { deleted: true };
			};
			createPrompt: {
				params: { folderId: string; title?: string };
				response: PromptRecord;
			};
			savePrompt: {
				params: {
					promptId: string;
					title: string;
					bodyMarkdown: string;
				};
				response: PromptRecord;
			};
			movePrompt: {
				params: {
					promptId: string;
					folderId: string;
				};
				response: PromptRecord;
			};
			renamePrompt: {
				params: { promptId: string; title: string };
				response: PromptRecord;
			};
			deletePrompt: {
				params: { promptId: string };
				response: { deleted: true };
			};
			searchPrompts: {
				params: { query: string };
				response: PromptSummary[];
			};
			copyPrompt: {
				params: { promptId: string };
				response: { copied: true };
			};
			exportLibrary: {
				params: undefined;
				response: { filePath: string | null };
			};
			importLibrary: {
				params: undefined;
				response: { imported: boolean };
			};
			cloudKitHealth: {
				params: undefined;
				response: {
					id: string;
					ok: boolean;
					result?: Record<string, string>;
					error?: string;
				};
			};
			cloudKitDescribeConfig: {
				params: undefined;
				response: {
					id: string;
					ok: boolean;
					result?: Record<string, string>;
					error?: string;
				};
			};
			cloudKitAccountStatus: {
				params: undefined;
				response: {
					id: string;
					ok: boolean;
					result?: Record<string, string>;
					error?: string;
				};
			};
			cloudKitSyncNow: {
				params: undefined;
				response: {
					available: boolean;
					accountStatus: string;
					syncInFlight: boolean;
					lastSyncAt: string | null;
					lastError: string | null;
				};
			};
			cloudKitSyncStatus: {
				params: undefined;
				response: {
					available: boolean;
					accountStatus: string;
					syncInFlight: boolean;
					lastSyncAt: string | null;
					lastError: string | null;
				};
			};
		};
		messages: {};
	};
	webview: {
		requests: {};
		messages: {};
	};
};
