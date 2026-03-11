export const promptStoreApi = {
	bootstrap: () => window.promptStore.bootstrap(),
	listFolders: () => window.promptStore.listFolders(),
	listPrompts: (folderId: string) => window.promptStore.listPrompts(folderId),
	getPrompt: (promptId: string) => window.promptStore.getPrompt(promptId),
	createFolder: (name: string, parentId: string | null) =>
		window.promptStore.createFolder(name, parentId),
	renameFolder: (folderId: string, name: string) =>
		window.promptStore.renameFolder(folderId, name),
	deleteFolder: (folderId: string) => window.promptStore.deleteFolder(folderId),
	createPrompt: (folderId: string, title?: string) =>
		window.promptStore.createPrompt(folderId, title),
	savePrompt: (promptId: string, title: string, bodyMarkdown: string) =>
		window.promptStore.savePrompt(promptId, title, bodyMarkdown),
	movePrompt: (promptId: string, folderId: string) =>
		window.promptStore.movePrompt(promptId, folderId),
	renamePrompt: (promptId: string, title: string) =>
		window.promptStore.renamePrompt(promptId, title),
	deletePrompt: (promptId: string) => window.promptStore.deletePrompt(promptId),
	searchPrompts: (query: string) => window.promptStore.searchPrompts(query),
	copyPrompt: (promptId: string) => window.promptStore.copyPrompt(promptId),
	exportLibrary: () => window.promptStore.exportLibrary(),
	importLibrary: () => window.promptStore.importLibrary(),
	cloudKitHealth: () => window.promptStore.cloudKitHealth(),
	cloudKitDescribeConfig: () => window.promptStore.cloudKitDescribeConfig(),
	cloudKitAccountStatus: () => window.promptStore.cloudKitAccountStatus(),
	cloudKitSyncNow: () => window.promptStore.cloudKitSyncNow(),
	cloudKitSyncStatus: () => window.promptStore.cloudKitSyncStatus(),
};
