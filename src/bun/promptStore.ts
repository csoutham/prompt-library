import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import matter from "gray-matter";
import type {
	BootstrapPayload,
	FolderRecord,
	PromptLibrarySnapshot,
	PromptRecord,
	PromptSummary,
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
};

export class PromptStoreError extends Error {}

export class PromptStore {
	constructor(private readonly rootDir: string) {}

	async bootstrap(): Promise<BootstrapPayload> {
		await this.ensureInitialized();
		const [folders, prompts] = await Promise.all([
			this.listFolders(),
			this.listAllPrompts(),
		]);

		return {
			folders,
			prompts: prompts.map(toPromptSummary),
		};
	}

	async listFolders(): Promise<FolderRecord[]> {
		await this.ensureInitialized();
		return this.readFolders();
	}

	async listPrompts(folderId: string): Promise<PromptSummary[]> {
		await this.ensureFolderExists(folderId);
		const prompts = await this.listAllPrompts();
		return prompts
			.filter((prompt) => prompt.folderId === folderId)
			.sort(sortPrompts)
			.map(toPromptSummary);
	}

	async getPrompt(promptId: string): Promise<PromptRecord | null> {
		await this.ensureInitialized();
		return this.readPromptFile(promptId);
	}

	async createFolder(name: string, parentId: string | null): Promise<FolderRecord> {
		await this.ensureInitialized();
		const trimmedName = normalizeName(name, "New Folder");
		const folders = await this.readFolders();
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
		};

		folders.push(folder);
		await this.writeFolders(folders);
		return folder;
	}

	async renameFolder(folderId: string, name: string): Promise<FolderRecord> {
		await this.ensureInitialized();
		const folders = await this.readFolders();
		const folder = folders.find((entry) => entry.id === folderId);
		if (!folder) {
			throw new PromptStoreError("Folder not found.");
		}

		folder.name = normalizeName(name, folder.name);
		folder.updatedAt = new Date().toISOString();
		await this.writeFolders(folders);
		return folder;
	}

	async deleteFolder(folderId: string): Promise<void> {
		await this.ensureInitialized();
		const folders = await this.readFolders();
		const hasChildren = folders.some((folder) => folder.parentId === folderId);
		if (hasChildren) {
			throw new PromptStoreError("Move or delete child folders before deleting this folder.");
		}

		const prompts = await this.listAllPrompts();
		const hasPrompts = prompts.some((prompt) => prompt.folderId === folderId);
		if (hasPrompts) {
			throw new PromptStoreError("Move or delete prompts before deleting this folder.");
		}

		const nextFolders = folders.filter((folder) => folder.id !== folderId);
		if (nextFolders.length === folders.length) {
			throw new PromptStoreError("Folder not found.");
		}

		if (nextFolders.length === 0) {
			const now = new Date().toISOString();
			nextFolders.push({
				id: crypto.randomUUID(),
				name: DEFAULT_FOLDER_NAME,
				parentId: null,
				createdAt: now,
				updatedAt: now,
			});
		}

		await this.writeFolders(nextFolders);
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
		const filePath = this.getPromptPath(promptId);
		try {
			await rm(filePath);
		} catch (error) {
			if (isMissingFile(error)) {
				throw new PromptStoreError("Prompt not found.");
			}
			throw error;
		}
	}

	async searchPrompts(query: string): Promise<PromptSummary[]> {
		await this.ensureInitialized();
		const normalized = query.trim().toLowerCase();
		if (!normalized) {
			return [];
		}

		const prompts = await this.listAllPrompts();
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
			});
			await this.writeFolders(folders);
		}
	}

	private async ensureFolderExists(folderId: string): Promise<void> {
		const folders = await this.readFolders();
		if (!folders.some((folder) => folder.id === folderId)) {
			throw new PromptStoreError("Folder not found.");
		}
	}

	private async readFolders(): Promise<FolderRecord[]> {
		try {
			const raw = await readFile(this.foldersPath, "utf8");
			const parsed = JSON.parse(raw) as FolderManifest;
			const folders = Array.isArray(parsed.folders) ? parsed.folders : [];
			return folders.sort(sortFolders);
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

	private async listAllPrompts(): Promise<PromptRecord[]> {
		const entries = await readdir(this.promptsDir).catch(() => [] as string[]);
		const promptFiles = entries.filter((entry) => entry.endsWith(".md"));
		const prompts = await Promise.all(
			promptFiles.map((entry) => this.readPromptFile(basename(entry, ".md"))),
		);

		return prompts.filter((prompt): prompt is PromptRecord => prompt !== null).sort(sortPrompts);
	}

	private async readPromptFile(promptId: string): Promise<PromptRecord | null> {
		try {
			const raw = await readFile(this.getPromptPath(promptId), "utf8");
			const parsed = matter(raw);
			const data = parsed.data as Partial<PromptFrontmatter>;

			if (!data.id || !data.folderId || !data.createdAt || !data.updatedAt) {
				return null;
			}

			return {
				id: data.id,
				title: normalizeName(data.title ?? "Untitled Prompt", "Untitled Prompt"),
				folderId: data.folderId,
				bodyMarkdown: parsed.content.replace(/^\n/, ""),
				createdAt: data.createdAt,
				updatedAt: data.updatedAt,
			};
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
