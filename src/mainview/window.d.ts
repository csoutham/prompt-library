import type {
	BootstrapPayload,
	FolderRecord,
	PromptRecord,
	PromptSummary,
} from "../shared/prompt-store";

declare global {
	interface Window {
		promptStore: {
			bootstrap: () => Promise<BootstrapPayload>;
			listFolders: () => Promise<FolderRecord[]>;
			listPrompts: (folderId: string) => Promise<PromptSummary[]>;
			getPrompt: (promptId: string) => Promise<PromptRecord | null>;
			createFolder: (name: string, parentId: string | null) => Promise<FolderRecord>;
			renameFolder: (folderId: string, name: string) => Promise<FolderRecord>;
			deleteFolder: (folderId: string) => Promise<{ deleted: true }>;
			createPrompt: (folderId: string, title?: string) => Promise<PromptRecord>;
			savePrompt: (
				promptId: string,
				title: string,
				bodyMarkdown: string,
			) => Promise<PromptRecord>;
			movePrompt: (promptId: string, folderId: string) => Promise<PromptRecord>;
			renamePrompt: (promptId: string, title: string) => Promise<PromptRecord>;
			deletePrompt: (promptId: string) => Promise<{ deleted: true }>;
			searchPrompts: (query: string) => Promise<PromptSummary[]>;
			copyPrompt: (promptId: string) => Promise<{ copied: true }>;
			exportLibrary: () => Promise<{ filePath: string | null }>;
			importLibrary: () => Promise<{ imported: boolean }>;
			cloudKitHealth: () => Promise<{
				id: string;
				ok: boolean;
				result?: Record<string, string>;
				error?: string;
			}>;
			cloudKitDescribeConfig: () => Promise<{
				id: string;
				ok: boolean;
				result?: Record<string, string>;
				error?: string;
			}>;
			cloudKitAccountStatus: () => Promise<{
				id: string;
				ok: boolean;
				result?: Record<string, string>;
				error?: string;
			}>;
			cloudKitSyncNow: () => Promise<{
				available: boolean;
				accountStatus: string;
				syncInFlight: boolean;
				lastSyncAt: string | null;
				lastError: string | null;
			}>;
			cloudKitSyncStatus: () => Promise<{
				available: boolean;
				accountStatus: string;
				syncInFlight: boolean;
				lastSyncAt: string | null;
				lastError: string | null;
			}>;
		};
	}
}

export {};
