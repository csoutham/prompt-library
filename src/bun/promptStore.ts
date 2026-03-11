import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import matter from "gray-matter";
import type {
	BootstrapPayload,
	FolderRecord,
	PromptRepository,
	PromptLibrarySnapshot,
	PromptRecord,
	PromptSummary,
	RecordQueryOptions,
	SyncMetadata,
	SyncStatus,
} from "../shared/prompt-store";

const FOLDERS_FILE = "folders.json";
const PROMPTS_DIR = "prompts";
const DEFAULT_FOLDER_NAME = "Library";

type FolderManifest = {
	folders: FolderRecord[];
};

type PromptFrontmatter = {
	id: string;
	title: string;
	folderId: string;
	createdAt: string;
	updatedAt: string;
} & SyncMetadata;

export class PromptStoreError extends Error {}

export class PromptStore implements PromptRepository {
	constructor(private readonly rootDir: string) {}

	async bootstrap(options?: RecordQueryOptions): Promise<BootstrapPayload> {
		await this.ensureInitialized();
		const [folders, prompts] = await Promise.all([
			this.listFolders(options),
			this.listAllPrompts(options),
		]);

		return {
			folders,
			prompts: prompts.map(toPromptSummary),
		};
	}

	async listFolders(options?: RecordQueryOptions): Promise<FolderRecord[]> {
		await this.ensureInitialized();
		return this.readFolders(options);
	}

	async listPrompts(folderId: string, options?: RecordQueryOptions): Promise<PromptSummary[]> {
		await this.ensureFolderExists(folderId, options);
		const prompts = await this.listAllPrompts(options);
		return prompts
			.filter((prompt) => prompt.folderId === folderId)
			.sort(sortPrompts)
			.map(toPromptSummary);
	}

	async getPrompt(promptId: string, options?: RecordQueryOptions): Promise<PromptRecord | null> {
		await this.ensureInitialized();
		return this.readPromptFile(promptId, options);
	}

	async createFolder(name: string, parentId: string | null): Promise<FolderRecord> {
		await this.ensureInitialized();
		const trimmedName = normalizeName(name, "New Folder");
		const folders = await this.readFolders({ includeDeleted: true });
		if (parentId) {
			const parentFolder = folders.find((folder) => folder.id === parentId);
			if (!parentFolder) {
				throw new PromptStoreError("Folder not found.");
			}
			if (parentFolder.parentId !== null) {
				throw new PromptStoreError("Folders can only be nested one level deep.");
			}
		}

		const now = new Date().toISOString();
		const folder: FolderRecord = {
			id: crypto.randomUUID(),
			name: trimmedName,
			parentId,
			createdAt: now,
			updatedAt: now,
			...createSyncMetadata("local"),
		};

		folders.push(folder);
		await this.writeFolders(folders);
		return folder;
	}

	async renameFolder(folderId: string, name: string): Promise<FolderRecord> {
		await this.ensureInitialized();
		const folders = await this.readFolders({ includeDeleted: true });
		const folder = folders.find((entry) => entry.id === folderId);
		if (!folder) {
			throw new PromptStoreError("Folder not found.");
		}

		folder.name = normalizeName(name, folder.name);
		folder.updatedAt = new Date().toISOString();
		folder.syncStatus = nextSyncStatus(folder.syncStatus);
		await this.writeFolders(folders);
		return folder;
	}

	async deleteFolder(folderId: string): Promise<void> {
		await this.ensureInitialized();
		const folders = await this.readFolders({ includeDeleted: true });
		const folder = folders.find((entry) => entry.id === folderId && entry.deletedAt === null);
		if (!folder) {
			throw new PromptStoreError("Folder not found.");
		}

		const hasChildren = folders.some(
			(entry) => entry.parentId === folderId && entry.deletedAt === null,
		);
		if (hasChildren) {
			throw new PromptStoreError("Move or delete child folders before deleting this folder.");
		}

		const prompts = await this.listAllPrompts();
		const hasPrompts = prompts.some((prompt) => prompt.folderId === folderId);
		if (hasPrompts) {
			throw new PromptStoreError("Move or delete prompts before deleting this folder.");
		}

		const now = new Date().toISOString();
		folder.deletedAt = now;
		folder.updatedAt = now;
		folder.syncStatus = nextSyncStatus(folder.syncStatus);

		const activeFolders = folders.filter((entry) => entry.deletedAt === null);
		if (activeFolders.length === 0) {
			activeFolders.push({
				id: crypto.randomUUID(),
				name: DEFAULT_FOLDER_NAME,
				parentId: null,
				createdAt: now,
				updatedAt: now,
				...createSyncMetadata("local"),
			});
		}

		await this.writeFolders([...folders.filter((entry) => entry.deletedAt !== null), ...activeFolders]);
	}

	async createPrompt(folderId: string, title = "Untitled Prompt"): Promise<PromptRecord> {
		await this.ensureFolderExists(folderId);
		const now = new Date().toISOString();
		const prompt: PromptRecord = {
			id: crypto.randomUUID(),
			title: normalizeName(title, "Untitled Prompt"),
			folderId,
			bodyMarkdown: "",
			createdAt: now,
			updatedAt: now,
			...createSyncMetadata("local"),
		};

		await this.writePromptFile(prompt);
		return prompt;
	}

	async savePrompt(
		promptId: string,
		title: string,
		bodyMarkdown: string,
	): Promise<PromptRecord> {
		await this.ensureInitialized();
		const existing = await this.readPromptFile(promptId);
		if (!existing) {
			throw new PromptStoreError("Prompt not found.");
		}

		const prompt: PromptRecord = {
			...existing,
			title: normalizeName(title, existing.title),
			bodyMarkdown,
			updatedAt: new Date().toISOString(),
			syncStatus: nextSyncStatus(existing.syncStatus),
		};

		await this.writePromptFile(prompt);
		return prompt;
	}

	async movePrompt(promptId: string, folderId: string): Promise<PromptRecord> {
		await this.ensureFolderExists(folderId);
		const existing = await this.getPrompt(promptId);
		if (!existing) {
			throw new PromptStoreError("Prompt not found.");
		}

		const prompt: PromptRecord = {
			...existing,
			folderId,
			updatedAt: new Date().toISOString(),
			syncStatus: nextSyncStatus(existing.syncStatus),
		};

		await this.writePromptFile(prompt);
		return prompt;
	}

	async renamePrompt(promptId: string, title: string): Promise<PromptRecord> {
		const existing = await this.getPrompt(promptId);
		if (!existing) {
			throw new PromptStoreError("Prompt not found.");
		}

		return this.savePrompt(promptId, title, existing.bodyMarkdown);
	}

	async deletePrompt(promptId: string): Promise<void> {
		await this.ensureInitialized();
		const prompt = await this.readPromptFile(promptId, { includeDeleted: true });
		if (!prompt || prompt.deletedAt !== null) {
			throw new PromptStoreError("Prompt not found.");
		}

		prompt.deletedAt = new Date().toISOString();
		prompt.updatedAt = prompt.deletedAt;
		prompt.syncStatus = nextSyncStatus(prompt.syncStatus);
		await this.writePromptFile(prompt);
	}

	async searchPrompts(query: string, options?: RecordQueryOptions): Promise<PromptSummary[]> {
		await this.ensureInitialized();
		const normalized = query.trim().toLowerCase();
		if (!normalized) {
			return [];
		}

		const prompts = await this.listAllPrompts(options);
		return prompts
			.filter((prompt) => {
				const haystack = `${prompt.title}\n${prompt.bodyMarkdown}`.toLowerCase();
				return haystack.includes(normalized);
			})
			.sort(sortPrompts)
			.map(toPromptSummary);
	}

	async exportSnapshot(): Promise<PromptLibrarySnapshot> {
		await this.ensureInitialized();
		const [folders, prompts] = await Promise.all([
			this.readFolders(),
			this.listAllPrompts(),
		]);

		return {
			version: 1,
			exportedAt: new Date().toISOString(),
			folders,
			prompts,
		};
	}

	async importSnapshot(snapshot: PromptLibrarySnapshot): Promise<void> {
		await this.ensureInitialized();
		validateSnapshot(snapshot);

		await rm(this.promptsDir, { recursive: true, force: true });
		await mkdir(this.promptsDir, { recursive: true });
		await this.writeFolders(snapshot.folders);
		await Promise.all(snapshot.prompts.map((prompt) => this.writePromptFile(prompt)));
	}

	private async ensureInitialized(): Promise<void> {
		await mkdir(this.promptsDir, { recursive: true });
		const hasFolders = await this.exists(this.foldersPath);
		if (!hasFolders) {
			const now = new Date().toISOString();
			const manifest: FolderManifest = {
				folders: [
					{
						id: crypto.randomUUID(),
						name: DEFAULT_FOLDER_NAME,
						parentId: null,
						createdAt: now,
						updatedAt: now,
						...createSyncMetadata("local"),
					},
				],
			};
			await writeFile(this.foldersPath, JSON.stringify(manifest, null, 2));
			return;
		}

		const folders = await this.readFolders();
		if (folders.length === 0) {
			const now = new Date().toISOString();
			folders.push({
				id: crypto.randomUUID(),
				name: DEFAULT_FOLDER_NAME,
				parentId: null,
				createdAt: now,
				updatedAt: now,
				...createSyncMetadata("local"),
			});
			await this.writeFolders(folders);
		}
	}

	private async ensureFolderExists(folderId: string, options?: RecordQueryOptions): Promise<void> {
		const folders = await this.readFolders(options);
		if (!folders.some((folder) => folder.id === folderId)) {
			throw new PromptStoreError("Folder not found.");
		}
	}

	private async readFolders(options?: RecordQueryOptions): Promise<FolderRecord[]> {
		try {
			const raw = await readFile(this.foldersPath, "utf8");
			const parsed = JSON.parse(raw) as FolderManifest;
			const folders = Array.isArray(parsed.folders) ? parsed.folders : [];
			return folders
				.map((folder) => normalizeFolderRecord(folder))
				.filter((folder) => options?.includeDeleted || folder.deletedAt === null)
				.sort(sortFolders);
		} catch (error) {
			if (isMissingFile(error)) {
				return [];
			}

			const backupPath = join(this.rootDir, `folders.invalid.${Date.now()}.json`);
			await rename(this.foldersPath, backupPath).catch(() => undefined);
			return [];
		}
	}

	private async writeFolders(folders: FolderRecord[]): Promise<void> {
		const manifest: FolderManifest = {
			folders: folders.sort(sortFolders),
		};
		await writeFile(this.foldersPath, JSON.stringify(manifest, null, 2));
	}

	private async listAllPrompts(options?: RecordQueryOptions): Promise<PromptRecord[]> {
		const entries = await readdir(this.promptsDir).catch(() => [] as string[]);
		const promptFiles = entries.filter((entry) => entry.endsWith(".md"));
		const prompts = await Promise.all(
			promptFiles.map((entry) => this.readPromptFile(basename(entry, ".md"), options)),
		);

		return prompts.filter((prompt): prompt is PromptRecord => prompt !== null).sort(sortPrompts);
	}

	private async readPromptFile(
		promptId: string,
		options?: RecordQueryOptions,
	): Promise<PromptRecord | null> {
		try {
			const raw = await readFile(this.getPromptPath(promptId), "utf8");
			const parsed = matter(raw);
			const data = parsed.data as Partial<PromptFrontmatter>;

			if (!data.id || !data.folderId || !data.createdAt || !data.updatedAt) {
				return null;
			}

			const prompt = normalizePromptRecord({
				id: data.id,
				title: normalizeName(data.title ?? "Untitled Prompt", "Untitled Prompt"),
				folderId: data.folderId,
				bodyMarkdown: parsed.content.replace(/^\n/, ""),
				createdAt: data.createdAt,
				updatedAt: data.updatedAt,
				deletedAt: data.deletedAt ?? null,
				lastSyncedAt: data.lastSyncedAt ?? null,
				syncStatus: data.syncStatus,
				cloudKitRecordName: data.cloudKitRecordName ?? null,
			});

			if (!options?.includeDeleted && prompt.deletedAt !== null) {
				return null;
			}

			return prompt;
		} catch (error) {
			if (isMissingFile(error)) {
				return null;
			}

			return null;
		}
	}

	private async writePromptFile(prompt: PromptRecord): Promise<void> {
		await mkdir(this.promptsDir, { recursive: true });
		const raw = matter.stringify(prompt.bodyMarkdown, {
			id: prompt.id,
			title: prompt.title,
			folderId: prompt.folderId,
			createdAt: prompt.createdAt,
			updatedAt: prompt.updatedAt,
			deletedAt: prompt.deletedAt,
			lastSyncedAt: prompt.lastSyncedAt,
			syncStatus: prompt.syncStatus,
			cloudKitRecordName: prompt.cloudKitRecordName,
		});
		await writeFile(this.getPromptPath(prompt.id), raw);
	}

	private async exists(path: string): Promise<boolean> {
		try {
			await stat(path);
			return true;
		} catch {
			return false;
		}
	}

	private get foldersPath(): string {
		return join(this.rootDir, FOLDERS_FILE);
	}

	private get promptsDir(): string {
		return join(this.rootDir, PROMPTS_DIR);
	}

	private getPromptPath(promptId: string): string {
		return join(this.promptsDir, `${promptId}.md`);
	}
}

function normalizeName(value: string, fallback: string): string {
	const trimmed = value.trim();
	return trimmed.length > 0 ? value : fallback;
}

function toPromptSummary(prompt: PromptRecord): PromptSummary {
	return {
		id: prompt.id,
		title: prompt.title,
		folderId: prompt.folderId,
		createdAt: prompt.createdAt,
		updatedAt: prompt.updatedAt,
		deletedAt: prompt.deletedAt,
		lastSyncedAt: prompt.lastSyncedAt,
		syncStatus: prompt.syncStatus,
		cloudKitRecordName: prompt.cloudKitRecordName,
		excerpt: excerptFromMarkdown(prompt.bodyMarkdown),
	};
}

function excerptFromMarkdown(bodyMarkdown: string): string {
	const compact = bodyMarkdown.replace(/\s+/g, " ").trim();
	return compact.slice(0, 120);
}

function sortFolders(left: FolderRecord, right: FolderRecord): number {
	return left.name.localeCompare(right.name);
}

function sortPrompts(left: PromptRecord, right: PromptRecord): number {
	return right.updatedAt.localeCompare(left.updatedAt);
}

function createSyncMetadata(syncStatus: SyncStatus): SyncMetadata {
	return {
		deletedAt: null,
		lastSyncedAt: null,
		syncStatus,
		cloudKitRecordName: null,
	};
}

function nextSyncStatus(current: SyncStatus): SyncStatus {
	return current === "synced" ? "modified" : current;
}

function normalizeFolderRecord(folder: Partial<FolderRecord>): FolderRecord {
	return {
		id: folder.id ?? crypto.randomUUID(),
		name: folder.name ?? DEFAULT_FOLDER_NAME,
		parentId: folder.parentId ?? null,
		createdAt: folder.createdAt ?? new Date().toISOString(),
		updatedAt: folder.updatedAt ?? new Date().toISOString(),
		deletedAt: folder.deletedAt ?? null,
		lastSyncedAt: folder.lastSyncedAt ?? null,
		syncStatus: folder.syncStatus ?? "local",
		cloudKitRecordName: folder.cloudKitRecordName ?? null,
	};
}

function normalizePromptRecord(prompt: Partial<PromptRecord>): PromptRecord {
	return {
		id: prompt.id ?? crypto.randomUUID(),
		title: normalizeName(prompt.title ?? "Untitled Prompt", "Untitled Prompt"),
		folderId: prompt.folderId ?? "",
		bodyMarkdown: prompt.bodyMarkdown ?? "",
		createdAt: prompt.createdAt ?? new Date().toISOString(),
		updatedAt: prompt.updatedAt ?? new Date().toISOString(),
		deletedAt: prompt.deletedAt ?? null,
		lastSyncedAt: prompt.lastSyncedAt ?? null,
		syncStatus: prompt.syncStatus ?? "local",
		cloudKitRecordName: prompt.cloudKitRecordName ?? null,
	};
}

function isMissingFile(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}

function validateSnapshot(snapshot: PromptLibrarySnapshot): void {
	if (snapshot.version !== 1) {
		throw new PromptStoreError("Unsupported import format.");
	}

	if (snapshot.folders.length === 0) {
		throw new PromptStoreError("Import file does not contain any folders.");
	}

	const folderIds = new Set(snapshot.folders.map((folder) => folder.id));
	for (const prompt of snapshot.prompts) {
		if (!folderIds.has(prompt.folderId)) {
			throw new PromptStoreError("Import file contains prompts with missing folders.");
		}
	}
}
