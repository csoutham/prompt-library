import {
	ApplicationMenu,
	BrowserWindow,
	Tray,
	Utils,
	Updater,
	type MenuItemConfig,
} from "electrobun/bun";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PromptStore, PromptStoreError } from "./promptStore";
import { createBunRpc } from "./rpc";
import type {
	FolderRecord,
	PromptLibrarySnapshot,
	PromptSummary,
} from "../shared/prompt-store";

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
const tray = new Tray({
	image: "views://mainview/tray-icon.svg",
	template: true,
	width: 18,
	height: 18,
});
let mainWindow: BrowserWindow<any>;

ApplicationMenu.setApplicationMenu([
	{
		label: "Your Prompt Library",
		submenu: [{ role: "about" }, { type: "divider" }, { role: "quit" }],
	},
	{
		label: "Edit",
		submenu: [
			{ role: "undo" },
			{ role: "redo" },
			{ type: "divider" },
			{ role: "cut" },
			{ role: "copy" },
			{ role: "paste" },
			{ role: "pasteAndMatchStyle" },
			{ role: "delete" },
			{ role: "selectAll" },
		],
	},
	{
		label: "Window",
		submenu: [{ role: "minimize" }, { role: "zoom" }],
	},
]);

async function copyPromptToClipboard(promptId: string) {
	const prompt = await store.getPrompt(promptId);
	if (!prompt) {
		throw new PromptStoreError("Prompt not found.");
	}
	Utils.clipboardWriteText(prompt.bodyMarkdown);
}

async function refreshTrayMenu() {
	const { folders, prompts } = await store.bootstrap();

	tray.setMenu([
		{
			type: "normal",
			label: "Prompt Library",
			enabled: false,
		},
		...buildFolderMenuItems(folders, prompts),
		{ type: "divider" },
		{
			type: "normal",
			label: "Open Your Prompt Library",
			action: "open-main-window",
		},
		{
			type: "normal",
			label: "Quit",
			action: "quit-app",
		},
	]);
}

function buildFolderMenuItems(
	folders: FolderRecord[],
	prompts: PromptSummary[],
): MenuItemConfig[] {
	const topLevelFolders = folders
		.filter((folder) => folder.parentId === null)
		.sort(sortFoldersByName);

	if (topLevelFolders.length === 0) {
		return [
			{
				type: "normal",
				label: "No prompts yet",
				enabled: false,
			},
		];
	}

	return topLevelFolders.map((folder) => ({
		type: "normal",
		label: folder.name,
		submenu: buildPromptSubmenu(folder, folders, prompts),
	}));
}

function buildPromptSubmenu(
	folder: FolderRecord,
	folders: FolderRecord[],
	prompts: PromptSummary[],
): MenuItemConfig[] {
	const directPrompts = prompts
		.filter((prompt) => prompt.folderId === folder.id)
		.sort(sortPromptTitles)
		.map(toPromptMenuItem);
	const childFolders = folders
		.filter((candidate) => candidate.parentId === folder.id)
		.sort(sortFoldersByName)
		.map((childFolder) => ({
			type: "normal" as const,
			label: childFolder.name,
			submenu: buildPromptSubmenu(childFolder, folders, prompts),
		}));

	const items = [...childFolders, ...directPrompts];
	if (items.length > 0) {
		return items;
	}

	return [
		{
			type: "normal",
			label: "No prompts",
			enabled: false,
		},
	];
}

function toPromptMenuItem(prompt: PromptSummary): MenuItemConfig {
	return {
		type: "normal",
		label: prompt.title,
		tooltip: "Copy prompt to clipboard",
		action: "copy-prompt",
		data: { promptId: prompt.id },
	};
}

function sortFoldersByName(left: FolderRecord, right: FolderRecord) {
	return left.name.localeCompare(right.name);
}

function sortPromptTitles(left: PromptSummary, right: PromptSummary) {
	return left.title.localeCompare(right.title);
}

tray.on("tray-clicked", async (event) => {
	const trayEvent = event as { action?: string; data?: { promptId?: string } };
	if (trayEvent.action === "copy-prompt" && trayEvent.data?.promptId) {
		await copyPromptToClipboard(trayEvent.data.promptId);
		return;
	}

	if (trayEvent.action === "open-main-window") {
		mainWindow.show();
		return;
	}

	if (trayEvent.action === "quit-app") {
		process.exit(0);
	}
});

const rpc = createBunRpc({
	bootstrap: async () => store.bootstrap(),
	listFolders: async () => store.listFolders(),
	listPrompts: async ({ folderId }) => store.listPrompts(folderId),
	getPrompt: async ({ promptId }) => store.getPrompt(promptId),
	createFolder: async ({ name, parentId }) => {
		const folder = await store.createFolder(name, parentId);
		await refreshTrayMenu();
		return folder;
	},
	renameFolder: async ({ folderId, name }) => {
		const folder = await store.renameFolder(folderId, name);
		await refreshTrayMenu();
		return folder;
	},
	deleteFolder: async ({ folderId }) => {
		await store.deleteFolder(folderId);
		await refreshTrayMenu();
		return { deleted: true as const };
	},
	createPrompt: async ({ folderId, title }) => {
		const prompt = await store.createPrompt(folderId, title);
		await refreshTrayMenu();
		return prompt;
	},
	savePrompt: async ({ promptId, title, bodyMarkdown }) => {
		const prompt = await store.savePrompt(promptId, title, bodyMarkdown);
		await refreshTrayMenu();
		return prompt;
	},
	movePrompt: async ({ promptId, folderId }) => {
		const prompt = await store.movePrompt(promptId, folderId);
		await refreshTrayMenu();
		return prompt;
	},
	renamePrompt: async ({ promptId, title }) => {
		const prompt = await store.renamePrompt(promptId, title);
		await refreshTrayMenu();
		return prompt;
	},
	deletePrompt: async ({ promptId }) => {
		await store.deletePrompt(promptId);
		await refreshTrayMenu();
		return { deleted: true as const };
	},
	searchPrompts: async ({ query }) => store.searchPrompts(query),
	copyPrompt: async ({ promptId }) => {
		await copyPromptToClipboard(promptId);
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
		await refreshTrayMenu();
		return { imported: true as const };
	},
});

mainWindow = new BrowserWindow({
	title: "Your prompt library",
	url,
	rpc,
	titleBarStyle: "hiddenInset",
	frame: {
		width: 1440,
		height: 920,
		x: 200,
		y: 200,
	},
});

await refreshTrayMenu();

mainWindow.webview.on("did-navigate", async () => {
	const folders = await store.listFolders();
	const title = folders[0]?.name
		? `Your prompt library - ${folders[0].name}`
		: "Your prompt library";
	mainWindow.setTitle(title);
});

console.log("Your prompt library app started!");
