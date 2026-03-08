import { BrowserWindow, Utils, Updater } from "electrobun/bun";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PromptStore, PromptStoreError } from "./promptStore";
import { createBunRpc } from "./rpc";
import type { PromptLibrarySnapshot } from "../shared/prompt-store";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// Check if Vite dev server is running for HMR
async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log(
				"Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
			);
		}
	}
	return "views://mainview/index.html";
}

// Create the main application window
const url = await getMainViewUrl();
const store = new PromptStore(join(Utils.paths.userData, "library"));
const rpc = createBunRpc({
	bootstrap: async () => store.bootstrap(),
	listFolders: async () => store.listFolders(),
	listPrompts: async ({ folderId }) => store.listPrompts(folderId),
	getPrompt: async ({ promptId }) => store.getPrompt(promptId),
	createFolder: async ({ name, parentId }) => store.createFolder(name, parentId),
	renameFolder: async ({ folderId, name }) => store.renameFolder(folderId, name),
	deleteFolder: async ({ folderId }) => {
		await store.deleteFolder(folderId);
		return { deleted: true as const };
	},
	createPrompt: async ({ folderId, title }) => store.createPrompt(folderId, title),
	savePrompt: async ({ promptId, title, bodyMarkdown }) =>
		store.savePrompt(promptId, title, bodyMarkdown),
	renamePrompt: async ({ promptId, title }) => store.renamePrompt(promptId, title),
	deletePrompt: async ({ promptId }) => {
		await store.deletePrompt(promptId);
		return { deleted: true as const };
	},
	searchPrompts: async ({ query }) => store.searchPrompts(query),
	copyPrompt: async ({ promptId }) => {
		const prompt = await store.getPrompt(promptId);
		if (!prompt) {
			throw new PromptStoreError("Prompt not found.");
		}
		Utils.clipboardWriteText(prompt.bodyMarkdown);
		return { copied: true as const };
	},
	exportLibrary: async () => {
		const [directory] = await Utils.openFileDialog({
			canChooseFiles: false,
			canChooseDirectory: true,
			allowsMultipleSelection: false,
		});
		if (!directory) {
			return { filePath: null };
		}

		const snapshot = await store.exportSnapshot();
		const filePath = join(
			directory,
			`prompt-store-export-${snapshot.exportedAt.slice(0, 10)}.json`,
		);
		await writeFile(filePath, JSON.stringify(snapshot, null, 2));
		return { filePath };
	},
	importLibrary: async () => {
		const [filePath] = await Utils.openFileDialog({
			canChooseFiles: true,
			canChooseDirectory: false,
			allowsMultipleSelection: false,
			allowedFileTypes: "json",
		});
		if (!filePath) {
			return { imported: false };
		}

		const raw = await Bun.file(filePath).text();
		const snapshot = JSON.parse(raw) as PromptLibrarySnapshot;
		await store.importSnapshot(snapshot);
		return { imported: true as const };
	},
});

const mainWindow = new BrowserWindow({
	title: "Prompt Store",
	url,
	rpc,
	titleBarStyle: "default",
	frame: {
		width: 1440,
		height: 920,
		x: 200,
		y: 200,
	},
});

mainWindow.webview.on("did-navigate", async () => {
	const folders = await store.listFolders();
	const title = folders[0]?.name ? `Prompt Store - ${folders[0].name}` : "Prompt Store";
	mainWindow.setTitle(title);
});

console.log("Prompt Store app started!");
