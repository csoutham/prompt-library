import {
	app,
	BrowserWindow,
	Menu,
	Tray,
	clipboard,
	dialog,
	ipcMain,
	nativeImage,
	type ContextMenuParams,
	type MenuItemConstructorOptions,
} from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CloudKitBridgeClient } from "./cloudKitBridge";
import { CloudKitRuntimeService } from "./cloudKitRuntime";
import { PromptStore, PromptStoreError } from "../bun/promptStore";
import type { CloudKitRuntimeStatus } from "../shared/cloudkit";
import type {
	FolderRecord,
	PromptLibrarySnapshot,
	PromptRecord,
	PromptSummary,
} from "../shared/prompt-store";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let promptStore: PromptStore;
let cloudKitBridge: CloudKitBridgeClient;
let cloudKitRuntime: CloudKitRuntimeService;
type TrayMenuItem = MenuItemConstructorOptions;

type PromptApi = {
	bootstrap: () => Promise<{ folders: FolderRecord[]; prompts: PromptSummary[] }>;
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
	cloudKitHealth: () => Promise<{ id: string; ok: boolean; result?: Record<string, string>; error?: string }>;
	cloudKitDescribeConfig: () => Promise<{ id: string; ok: boolean; result?: Record<string, string>; error?: string }>;
	cloudKitAccountStatus: () => Promise<{ id: string; ok: boolean; result?: Record<string, string>; error?: string }>;
	cloudKitSyncNow: () => Promise<CloudKitRuntimeStatus>;
	cloudKitSyncStatus: () => Promise<CloudKitRuntimeStatus>;
};

function trayIconPath() {
	return join(app.getAppPath(), "assets", "tray-icon.png");
}

function buildApplicationMenu() {
	Menu.setApplicationMenu(
		Menu.buildFromTemplate([
			{
				label: "Your Prompt Library",
				submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }],
			},
			{
				label: "Edit",
				submenu: [
					{ role: "undo" },
					{ role: "redo" },
					{ type: "separator" },
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
		]),
	);
}

function buildContextMenu(
	window: BrowserWindow,
	params: ContextMenuParams,
) {
	const template: MenuItemConstructorOptions[] = [];

	if (params.misspelledWord) {
		for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
			template.push({
				label: suggestion,
				click: () => window.webContents.replaceMisspelling(suggestion),
			});
		}

		if (params.dictionarySuggestions.length > 0) {
			template.push({ type: "separator" });
		}
	}

	if (params.isEditable) {
		template.push(
			{ role: "undo" },
			{ role: "redo" },
			{ type: "separator" },
			{ role: "cut" },
			{ role: "copy" },
			{ role: "paste" },
			{ role: "pasteAndMatchStyle" },
			{ role: "delete" },
			{ type: "separator" },
			{ role: "selectAll" },
		);
	} else if (params.selectionText.trim()) {
		template.push({ role: "copy" }, { type: "separator" }, { role: "selectAll" });
	}

	if (template.length === 0) {
		return;
	}

	Menu.buildFromTemplate(template).popup({ window });
}

async function mainViewUrl() {
	if (isDev) {
		return DEV_SERVER_URL;
	}

	return pathToFileURL(join(app.getAppPath(), "dist", "index.html")).toString();
}

async function createWindow() {
	const url = await mainViewUrl();
	mainWindow = new BrowserWindow({
		title: "Your prompt library",
		width: 1440,
		height: 920,
		x: 200,
		y: 200,
		show: false,
		titleBarStyle: "hiddenInset",
		webPreferences: {
			preload: join(app.getAppPath(), "build", "electron", "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
		},
	});

	mainWindow.once("ready-to-show", () => mainWindow?.show());

	if (isDev) {
		await mainWindow.loadURL(url);
	} else {
		await mainWindow.loadFile(join(app.getAppPath(), "dist", "index.html"));
	}

	mainWindow.webContents.on("did-finish-load", async () => {
		const folders = await promptStore.listFolders();
		const title = folders[0]?.name
			? `Your prompt library - ${folders[0].name}`
			: "Your prompt library";
		mainWindow?.setTitle(title);
	});

	mainWindow.webContents.on("context-menu", (_event, params) => {
		if (!mainWindow) {
			return;
		}

		buildContextMenu(mainWindow, params);
	});
}

async function copyPromptToClipboard(promptId: string) {
	const prompt = await promptStore.getPrompt(promptId);
	if (!prompt) {
		throw new PromptStoreError("Prompt not found.");
	}
	clipboard.writeText(prompt.bodyMarkdown);
}

function sortFoldersByName(left: FolderRecord, right: FolderRecord) {
	return left.name.localeCompare(right.name);
}

function sortPromptTitles(left: PromptSummary, right: PromptSummary) {
	return left.title.localeCompare(right.title);
}

function toPromptMenuItem(prompt: PromptSummary): TrayMenuItem {
	return {
		label: prompt.title,
		click: () => void copyPromptToClipboard(prompt.id),
	};
}

function buildPromptSubmenu(
	folder: FolderRecord,
	folders: FolderRecord[],
	prompts: PromptSummary[],
): TrayMenuItem[] {
	const childFolders = folders
		.filter((candidate) => candidate.parentId === folder.id)
		.sort(sortFoldersByName)
		.map<TrayMenuItem>((childFolder) => ({
			label: childFolder.name,
			submenu: buildPromptSubmenu(childFolder, folders, prompts),
		}));
	const directPrompts = prompts
		.filter((prompt) => prompt.folderId === folder.id)
		.sort(sortPromptTitles)
		.map(toPromptMenuItem);
	const items: TrayMenuItem[] = [...childFolders, ...directPrompts];

	return items.length > 0 ? items : [{ label: "No prompts", enabled: false }];
}

async function refreshTrayMenu() {
	if (!tray) {
		return;
	}

	const { folders, prompts } = await promptStore.bootstrap();
	const topLevelFolders = folders
		.filter((folder) => folder.parentId === null)
		.sort(sortFoldersByName);

	const folderItems: TrayMenuItem[] =
		topLevelFolders.length > 0
			? topLevelFolders.map<TrayMenuItem>((folder) => ({
					label: folder.name,
					submenu: buildPromptSubmenu(folder, folders, prompts),
				}))
			: [{ label: "No prompts yet", enabled: false }];

	tray.setContextMenu(
		Menu.buildFromTemplate([
			{ label: "Prompt Library", enabled: false },
			...folderItems,
			{ type: "separator" },
			{
				label: "Open Your Prompt Library",
				click: () => {
					if (!mainWindow) {
						return;
					}
					mainWindow.show();
					mainWindow.focus();
				},
			},
			{ label: "Quit", role: "quit" },
		]),
	);
}

function createTray() {
	const icon = nativeImage.createFromPath(trayIconPath());
	icon.setTemplateImage(true);
	tray = new Tray(icon);
	tray.setToolTip("Your Prompt Library");
	void refreshTrayMenu();
}

const promptApi: PromptApi = {
	bootstrap: async () => promptStore.bootstrap(),
	listFolders: async () => promptStore.listFolders(),
	listPrompts: async (folderId) => promptStore.listPrompts(folderId),
	getPrompt: async (promptId) => promptStore.getPrompt(promptId),
	createFolder: async (name, parentId) => {
		const folder = await promptStore.createFolder(name, parentId);
		await refreshTrayMenu();
		cloudKitRuntime.scheduleSync();
		return folder;
	},
	renameFolder: async (folderId, name) => {
		const folder = await promptStore.renameFolder(folderId, name);
		await refreshTrayMenu();
		cloudKitRuntime.scheduleSync();
		return folder;
	},
	deleteFolder: async (folderId) => {
		await promptStore.deleteFolder(folderId);
		await refreshTrayMenu();
		cloudKitRuntime.scheduleSync();
		return { deleted: true as const };
	},
	createPrompt: async (folderId, title) => {
		const prompt = await promptStore.createPrompt(folderId, title);
		await refreshTrayMenu();
		cloudKitRuntime.scheduleSync();
		return prompt;
	},
	savePrompt: async (promptId, title, bodyMarkdown) => {
		const prompt = await promptStore.savePrompt(promptId, title, bodyMarkdown);
		await refreshTrayMenu();
		cloudKitRuntime.scheduleSync();
		return prompt;
	},
	movePrompt: async (promptId, folderId) => {
		const prompt = await promptStore.movePrompt(promptId, folderId);
		await refreshTrayMenu();
		cloudKitRuntime.scheduleSync();
		return prompt;
	},
	renamePrompt: async (promptId, title) => {
		const prompt = await promptStore.renamePrompt(promptId, title);
		await refreshTrayMenu();
		cloudKitRuntime.scheduleSync();
		return prompt;
	},
	deletePrompt: async (promptId) => {
		await promptStore.deletePrompt(promptId);
		await refreshTrayMenu();
		cloudKitRuntime.scheduleSync();
		return { deleted: true as const };
	},
	searchPrompts: async (query) => promptStore.searchPrompts(query),
	copyPrompt: async (promptId) => {
		await copyPromptToClipboard(promptId);
		return { copied: true as const };
	},
	exportLibrary: async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openDirectory"],
		});
		const directory = result.filePaths[0];
		if (!directory) {
			return { filePath: null };
		}

		const snapshot = await promptStore.exportSnapshot();
		const filePath = join(
			directory,
			`prompt-store-export-${snapshot.exportedAt.slice(0, 10)}.json`,
		);
		await writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf8");
		return { filePath };
	},
	importLibrary: async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openFile"],
			filters: [{ name: "JSON", extensions: ["json"] }],
		});
		const filePath = result.filePaths[0];
		if (!filePath) {
			return { imported: false };
		}

		const raw = await readFile(filePath, "utf8");
		const snapshot = JSON.parse(raw) as PromptLibrarySnapshot;
		await promptStore.importSnapshot(snapshot);
		await refreshTrayMenu();
		cloudKitRuntime.scheduleSync();
		return { imported: true as const };
	},
	cloudKitHealth: async () => cloudKitBridge.healthCheck(),
	cloudKitDescribeConfig: async () => cloudKitBridge.describeConfig(),
	cloudKitAccountStatus: async () => cloudKitBridge.accountStatus(),
	cloudKitSyncNow: async () => {
		await cloudKitRuntime.syncNow();
		return cloudKitRuntime.getStatus();
	},
	cloudKitSyncStatus: async () => cloudKitRuntime.getStatus(),
};

app.whenReady().then(async () => {
	app.setName("Your Prompt Library");
	promptStore = new PromptStore(join(app.getPath("userData"), "library"));
	cloudKitBridge = new CloudKitBridgeClient();
	cloudKitRuntime = new CloudKitRuntimeService(promptStore, cloudKitBridge);
	for (const [channel, handler] of Object.entries(promptApi)) {
		ipcMain.handle(`prompt-store:${channel}`, async (_event, ...args) => {
			const invoke = handler as (...parameters: unknown[]) => Promise<unknown>;
			return invoke(...args);
		});
	}
	buildApplicationMenu();
	await createWindow();
	createTray();
	cloudKitRuntime.scheduleSync(250);
});

app.on("activate", async () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		await createWindow();
	}
	mainWindow?.show();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("before-quit", async () => {
	await cloudKitBridge?.dispose();
});

export { promptApi };
