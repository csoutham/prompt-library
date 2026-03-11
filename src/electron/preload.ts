import { contextBridge, ipcRenderer } from "electron";

const channels = [
	"bootstrap",
	"listFolders",
	"listPrompts",
	"getPrompt",
	"createFolder",
	"renameFolder",
	"deleteFolder",
	"createPrompt",
	"savePrompt",
	"movePrompt",
	"renamePrompt",
	"deletePrompt",
	"searchPrompts",
	"copyPrompt",
	"exportLibrary",
	"importLibrary",
	"cloudKitHealth",
	"cloudKitDescribeConfig",
	"cloudKitAccountStatus",
	"cloudKitSyncNow",
	"cloudKitSyncStatus",
] as const;

type Channel = (typeof channels)[number];

const promptStore = Object.fromEntries(
	channels.map((channel) => [
		channel,
		(...args: unknown[]) => ipcRenderer.invoke(`prompt-store:${channel}`, ...args),
	]),
) as Record<Channel, (...args: unknown[]) => Promise<unknown>>;

contextBridge.exposeInMainWorld("promptStore", promptStore);
