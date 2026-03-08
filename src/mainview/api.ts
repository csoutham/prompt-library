import { Electroview } from "electrobun/view";
import { createWebviewRpc } from "./rpc";

const rpc = createWebviewRpc();
new Electroview({ rpc });

export const promptStoreApi = {
	bootstrap: () => rpc.request.bootstrap(),
	listFolders: () => rpc.request.listFolders(),
	listPrompts: (folderId: string) => rpc.request.listPrompts({ folderId }),
	getPrompt: (promptId: string) => rpc.request.getPrompt({ promptId }),
	createFolder: (name: string, parentId: string | null) =>
		rpc.request.createFolder({ name, parentId }),
	renameFolder: (folderId: string, name: string) =>
		rpc.request.renameFolder({ folderId, name }),
	deleteFolder: (folderId: string) => rpc.request.deleteFolder({ folderId }),
	createPrompt: (folderId: string, title?: string) =>
		rpc.request.createPrompt({ folderId, title }),
	savePrompt: (promptId: string, title: string, bodyMarkdown: string) =>
		rpc.request.savePrompt({ promptId, title, bodyMarkdown }),
	renamePrompt: (promptId: string, title: string) =>
		rpc.request.renamePrompt({ promptId, title }),
	deletePrompt: (promptId: string) => rpc.request.deletePrompt({ promptId }),
	searchPrompts: (query: string) => rpc.request.searchPrompts({ query }),
	copyPrompt: (promptId: string) => rpc.request.copyPrompt({ promptId }),
	exportLibrary: () => rpc.request.exportLibrary(),
	importLibrary: () => rpc.request.importLibrary(),
};
