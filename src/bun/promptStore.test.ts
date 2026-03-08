import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import matter from "gray-matter";
import { PromptStore } from "./promptStore";

let rootDir: string;

beforeEach(async () => {
	rootDir = await mkdtemp(join(tmpdir(), "prompt-store-"));
});

afterEach(async () => {
	await rm(rootDir, { recursive: true, force: true });
});

describe("PromptStore", () => {
	test("creates the default folder on first launch", async () => {
		const store = new PromptStore(rootDir);
		const result = await store.bootstrap();

		expect(result.folders).toHaveLength(1);
		expect(result.folders[0]?.name).toBe("Library");
		expect(result.prompts).toHaveLength(0);
	});

	test("persists folders and prompts", async () => {
		const store = new PromptStore(rootDir);
		const folder = await store.createFolder("Strategy", null);
		const prompt = await store.createPrompt(folder.id, "Email Draft");
		await store.savePrompt(prompt.id, "Email Draft", "# Hello\n\nWorld");

		const reloaded = new PromptStore(rootDir);
		const folders = await reloaded.listFolders();
		const saved = await reloaded.getPrompt(prompt.id);

		expect(folders.some((entry) => entry.id === folder.id)).toBe(true);
		expect(saved?.bodyMarkdown).toContain("World");
	});

	test("searches titles and markdown body text", async () => {
		const store = new PromptStore(rootDir);
		const folder = (await store.listFolders())[0]!;
		const prompt = await store.createPrompt(folder.id, "Founder memo");
		await store.savePrompt(prompt.id, "Founder memo", "Use this note for launch prep.");

		expect(await store.searchPrompts("launch")).toHaveLength(1);
		expect(await store.searchPrompts("founder")).toHaveLength(1);
	});

	test("blocks deleting a non-empty folder", async () => {
		const store = new PromptStore(rootDir);
		const folder = await store.createFolder("Active", null);
		await store.createPrompt(folder.id);

		await expect(store.deleteFolder(folder.id)).rejects.toThrow(
			"Move or delete prompts before deleting this folder.",
		);
	});

	test("renames prompts and updates timestamps", async () => {
		const store = new PromptStore(rootDir);
		const folder = (await store.listFolders())[0]!;
		const prompt = await store.createPrompt(folder.id, "Draft");
		const renamed = await store.renamePrompt(prompt.id, "Final Draft");

		expect(renamed.title).toBe("Final Draft");
		expect(new Date(renamed.updatedAt).getTime()).toBeGreaterThanOrEqual(
			new Date(prompt.updatedAt).getTime(),
		);
	});

	test("deletes an empty folder", async () => {
		const store = new PromptStore(rootDir);
		const folder = await store.createFolder("Archive", null);
		await store.deleteFolder(folder.id);

		const folders = await store.listFolders();
		expect(folders.some((entry) => entry.id === folder.id)).toBe(false);
	});

	test("skips invalid prompt files without crashing", async () => {
		const store = new PromptStore(rootDir);
		await store.bootstrap();
		await writeFile(join(rootDir, "prompts", "broken.md"), "---\nid: bad\n---");

		const prompts = await store.searchPrompts("anything");
		expect(prompts).toEqual([]);
	});

	test("writes prompt metadata into frontmatter", async () => {
		const store = new PromptStore(rootDir);
		const folder = (await store.listFolders())[0]!;
		const prompt = await store.createPrompt(folder.id, "Spec");
		await store.savePrompt(prompt.id, "Spec", "## Body");

		const file = await readFile(join(rootDir, "prompts", `${prompt.id}.md`), "utf8");
		const parsed = matter(file);

		expect(parsed.data.title).toBe("Spec");
		expect(parsed.content.trim()).toBe("## Body");
	});
});
