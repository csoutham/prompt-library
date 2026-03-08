import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
	FolderRecord,
	PromptRecord,
	PromptSummary,
} from "../shared/prompt-store";
import { promptStoreApi } from "./api";

function App() {
	const [folders, setFolders] = useState<FolderRecord[]>([]);
	const [promptSummaries, setPromptSummaries] = useState<PromptSummary[]>([]);
	const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
	const [selectedPrompt, setSelectedPrompt] = useState<PromptRecord | null>(null);
	const [draftTitle, setDraftTitle] = useState("");
	const [draftBody, setDraftBody] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [statusMessage, setStatusMessage] = useState("Local library ready");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect(() => {
		void loadInitialState();
	}, []);

	useEffect(() => {
		if (!selectedPrompt) {
			return;
		}

		setDraftTitle(selectedPrompt.title);
		setDraftBody(selectedPrompt.bodyMarkdown);
	}, [selectedPrompt]);

	useEffect(() => {
		if (!selectedPrompt) {
			return;
		}

		const titleChanged = draftTitle !== selectedPrompt.title;
		const bodyChanged = draftBody !== selectedPrompt.bodyMarkdown;
		if (!titleChanged && !bodyChanged) {
			return;
		}

		const timeout = window.setTimeout(() => {
			void saveCurrentPrompt();
		}, 350);

		return () => window.clearTimeout(timeout);
	}, [draftBody, draftTitle, selectedPrompt]);

	const visiblePrompts = useMemo(() => {
		if (searchQuery.trim()) {
			return promptSummaries;
		}

		if (!selectedFolderId) {
			return [];
		}

		return promptSummaries.filter((prompt) => prompt.folderId === selectedFolderId);
	}, [promptSummaries, searchQuery, selectedFolderId]);

	const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? null;

	async function loadInitialState() {
		setIsLoading(true);
		setErrorMessage(null);

		try {
			const payload = await promptStoreApi.bootstrap();
			setFolders(payload.folders);
			setPromptSummaries(payload.prompts);

			const initialFolderId = payload.folders[0]?.id ?? null;
			setSelectedFolderId(initialFolderId);

			const initialPromptId = payload.prompts.find((prompt) => prompt.folderId === initialFolderId)?.id;
			if (initialPromptId) {
				const prompt = await promptStoreApi.getPrompt(initialPromptId);
				setSelectedPrompt(prompt);
			}
		} catch (error) {
			setErrorMessage(toMessage(error));
		} finally {
			setIsLoading(false);
		}
	}

	async function selectFolder(folderId: string) {
		setSelectedFolderId(folderId);
		setSearchQuery("");
		const prompts = await promptStoreApi.listPrompts(folderId);
		setPromptSummaries((current) => mergePromptSummaries(current, prompts, folderId));
		const firstPromptId = prompts[0]?.id;
		if (!firstPromptId) {
			setSelectedPrompt(null);
			return;
		}

		const prompt = await promptStoreApi.getPrompt(firstPromptId);
		setSelectedPrompt(prompt);
	}

	async function selectPrompt(promptId: string) {
		const prompt = await promptStoreApi.getPrompt(promptId);
		setSelectedPrompt(prompt);
	}

	async function createFolder() {
		const name = window.prompt("Folder name", "New Folder");
		if (!name) {
			return;
		}

		try {
			const folder = await promptStoreApi.createFolder(name, selectedFolderId);
			setFolders((current) => [...current, folder].sort(sortFolders));
			setSelectedFolderId(folder.id);
			setSelectedPrompt(null);
			setDraftTitle("");
			setDraftBody("");
			setStatusMessage(`Created folder "${folder.name}"`);
		} catch (error) {
			setErrorMessage(toMessage(error));
		}
	}

	async function renameFolder() {
		if (!selectedFolder) {
			return;
		}

		const name = window.prompt("Rename folder", selectedFolder.name);
		if (!name) {
			return;
		}

		try {
			const folder = await promptStoreApi.renameFolder(selectedFolder.id, name);
			setFolders((current) =>
				current.map((entry) => (entry.id === folder.id ? folder : entry)).sort(sortFolders),
			);
			setStatusMessage(`Renamed folder to "${folder.name}"`);
		} catch (error) {
			setErrorMessage(toMessage(error));
		}
	}

	async function deleteFolder() {
		if (!selectedFolder) {
			return;
		}

		const confirmed = window.confirm(`Delete folder "${selectedFolder.name}"?`);
		if (!confirmed) {
			return;
		}

		try {
			await promptStoreApi.deleteFolder(selectedFolder.id);
			const nextFolders = folders.filter((folder) => folder.id !== selectedFolder.id);
			const fallbackFolder = nextFolders[0] ?? null;
			setFolders(nextFolders);
			setSelectedFolderId(fallbackFolder?.id ?? null);
			setSelectedPrompt(null);
			if (fallbackFolder) {
				await selectFolder(fallbackFolder.id);
			}
			setStatusMessage(`Deleted folder "${selectedFolder.name}"`);
		} catch (error) {
			setErrorMessage(toMessage(error));
		}
	}

	async function createPrompt() {
		if (!selectedFolderId) {
			return;
		}

		try {
			const prompt = await promptStoreApi.createPrompt(selectedFolderId);
			const summary = summarizePrompt(prompt);
			setPromptSummaries((current) => [summary, ...current]);
			setSelectedPrompt(prompt);
			setDraftTitle(prompt.title);
			setDraftBody(prompt.bodyMarkdown);
			setStatusMessage("Created prompt");
		} catch (error) {
			setErrorMessage(toMessage(error));
		}
	}

	async function deletePrompt() {
		if (!selectedPrompt) {
			return;
		}

		const confirmed = window.confirm(`Delete prompt "${selectedPrompt.title}"?`);
		if (!confirmed) {
			return;
		}

		try {
			await promptStoreApi.deletePrompt(selectedPrompt.id);
			const nextSummaries = promptSummaries.filter((prompt) => prompt.id !== selectedPrompt.id);
			setPromptSummaries(nextSummaries);

			const nextPromptId = nextSummaries.find((prompt) => prompt.folderId === selectedPrompt.folderId)?.id;
			if (nextPromptId) {
				const prompt = await promptStoreApi.getPrompt(nextPromptId);
				setSelectedPrompt(prompt);
			} else {
				setSelectedPrompt(null);
				setDraftTitle("");
				setDraftBody("");
			}
			setStatusMessage(`Deleted prompt "${selectedPrompt.title}"`);
		} catch (error) {
			setErrorMessage(toMessage(error));
		}
	}

	async function renamePrompt() {
		if (!selectedPrompt) {
			return;
		}

		const title = window.prompt("Rename prompt", selectedPrompt.title);
		if (!title) {
			return;
		}

		try {
			const renamed = await promptStoreApi.renamePrompt(selectedPrompt.id, title);
			setSelectedPrompt(renamed);
			setDraftTitle(renamed.title);
			setPromptSummaries((current) =>
				replacePromptSummary(current, summarizePrompt(renamed)),
			);
			setStatusMessage(`Renamed prompt to "${renamed.title}"`);
		} catch (error) {
			setErrorMessage(toMessage(error));
		}
	}

	async function copyPrompt() {
		if (!selectedPrompt) {
			return;
		}

		try {
			await promptStoreApi.copyPrompt(selectedPrompt.id);
			setStatusMessage(`Copied "${selectedPrompt.title}"`);
		} catch (error) {
			setErrorMessage(toMessage(error));
		}
	}

	async function handleSearchChange(query: string) {
		setSearchQuery(query);
		setErrorMessage(null);

		if (!query.trim()) {
			if (selectedFolderId) {
				const prompts = await promptStoreApi.listPrompts(selectedFolderId);
				setPromptSummaries((current) => mergePromptSummaries(current, prompts, selectedFolderId));
			}
			return;
		}

		try {
			const results = await promptStoreApi.searchPrompts(query);
			setPromptSummaries(results);
		} catch (error) {
			setErrorMessage(toMessage(error));
		}
	}

	async function saveCurrentPrompt() {
		if (!selectedPrompt) {
			return;
		}

		setIsSaving(true);
		setErrorMessage(null);

		try {
			const saved = await promptStoreApi.savePrompt(selectedPrompt.id, draftTitle, draftBody);
			setSelectedPrompt(saved);
			setPromptSummaries((current) => replacePromptSummary(current, summarizePrompt(saved)));
			setStatusMessage(`Saved ${new Date(saved.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
		} catch (error) {
			setErrorMessage(toMessage(error));
		} finally {
			setIsSaving(false);
		}
	}

	if (isLoading) {
		return <div className="loading-shell">Loading Prompt Store…</div>;
	}

	return (
		<div className="app-shell">
			<div className="app-frame">
				<aside className="sidebar">
					<div className="sidebar__masthead">
						<p className="eyebrow">Prompt Store</p>
						<h1>Quietly local. Fast to reach.</h1>
						<p className="sidebar__lede">
							A lightweight library for prompts you want to keep close and searchable.
						</p>
					</div>

					<div className="sidebar__controls">
						<button className="button button--primary" onClick={() => void createFolder()}>
							New Folder
						</button>
						<button className="button" disabled={!selectedFolder} onClick={() => void renameFolder()}>
							Rename
						</button>
						<button className="button button--danger" disabled={!selectedFolder} onClick={() => void deleteFolder()}>
							Delete
						</button>
					</div>

					<div className="folder-tree">
						{renderFolderTree(folders, null, selectedFolderId, selectFolder)}
					</div>
				</aside>

				<section className="prompt-list-panel">
					<div className="panel-header">
						<div>
							<p className="eyebrow">{searchQuery ? "Search Results" : selectedFolder?.name ?? "Library"}</p>
							<h2>{visiblePrompts.length} prompts</h2>
						</div>
						<button className="button button--primary" disabled={!selectedFolderId} onClick={() => void createPrompt()}>
							New Prompt
						</button>
					</div>

					<label className="search-field">
						<span>Search</span>
						<input
							value={searchQuery}
							onChange={(event) => void handleSearchChange(event.target.value)}
							placeholder="Search titles and Markdown"
						/>
					</label>

					<div className="prompt-list">
						{visiblePrompts.length === 0 ? (
							<div className="empty-state">
								<p>No prompts yet.</p>
								<span>Create one in this folder to start your library.</span>
							</div>
						) : (
							visiblePrompts.map((prompt) => (
								<button
									key={prompt.id}
									className={`prompt-card ${selectedPrompt?.id === prompt.id ? "prompt-card--active" : ""}`}
									onClick={() => void selectPrompt(prompt.id)}
								>
									<div className="prompt-card__title">{prompt.title}</div>
									<div className="prompt-card__excerpt">{prompt.excerpt || "Empty prompt"}</div>
									<div className="prompt-card__meta">
										<span>{folderNameFor(prompt.folderId, folders)}</span>
										<span>{formatTimestamp(prompt.updatedAt)}</span>
									</div>
								</button>
							))
						)}
					</div>
				</section>

				<section className="editor-panel">
					<div className="panel-header">
						<div>
							<p className="eyebrow">Editor</p>
							<h2>{selectedPrompt?.title ?? "Select a prompt"}</h2>
						</div>
						<div className="editor-actions">
							<button className="button" disabled={!selectedPrompt} onClick={() => void copyPrompt()}>
								Copy
							</button>
							<button className="button" disabled={!selectedPrompt} onClick={() => void renamePrompt()}>
								Rename
							</button>
							<button className="button button--danger" disabled={!selectedPrompt} onClick={() => void deletePrompt()}>
								Delete
							</button>
						</div>
					</div>

					{selectedPrompt ? (
						<div className="editor-layout">
							<div className="editor-pane">
								<div className="editor-meta">
									<div>
										<span className="editor-meta__label">Folder</span>
										<strong>{folderNameFor(selectedPrompt.folderId, folders)}</strong>
									</div>
									<div>
										<span className="editor-meta__label">Created</span>
										<strong>{formatDateTime(selectedPrompt.createdAt)}</strong>
									</div>
									<div>
										<span className="editor-meta__label">Updated</span>
										<strong>{formatDateTime(selectedPrompt.updatedAt)}</strong>
									</div>
								</div>
								<label className="editor-field">
									<span>Title</span>
									<input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
								</label>
								<label className="editor-field editor-field--body">
									<span>Markdown</span>
									<textarea
										value={draftBody}
										onChange={(event) => setDraftBody(event.target.value)}
										placeholder="# Prompt title&#10;&#10;Write the reusable instructions here."
									/>
								</label>
							</div>

							<div className="preview-pane">
								<div className="preview-pane__header">Preview</div>
								<div className="markdown-preview">
									<ReactMarkdown remarkPlugins={[remarkGfm]}>
										{draftBody.trim() ? draftBody : "_Nothing to preview yet._"}
									</ReactMarkdown>
								</div>
							</div>
						</div>
					) : (
						<div className="empty-state empty-state--editor">
							<p>Choose a prompt or create a new one.</p>
							<span>Markdown autosaves after you pause typing.</span>
						</div>
					)}

					<footer className="status-bar">
						<span>{errorMessage ?? statusMessage}</span>
						<span>{isSaving ? "Autosaving…" : selectedPrompt ? `Updated ${formatTimestamp(selectedPrompt.updatedAt)}` : "Idle"}</span>
					</footer>
				</section>
			</div>
		</div>
	);
}

function renderFolderTree(
	folders: FolderRecord[],
	parentId: string | null,
	selectedFolderId: string | null,
	onSelect: (folderId: string) => void | Promise<void>,
) {
	return folders
		.filter((folder) => folder.parentId === parentId)
		.map((folder) => (
			<div key={folder.id} className="folder-tree__branch">
				<button
					className={`folder-tree__item ${selectedFolderId === folder.id ? "folder-tree__item--active" : ""}`}
					onClick={() => void onSelect(folder.id)}
				>
					<span className="folder-tree__dot" />
					{folder.name}
				</button>
				<div className="folder-tree__children">
					{renderFolderTree(folders, folder.id, selectedFolderId, onSelect)}
				</div>
			</div>
		));
}

function summarizePrompt(prompt: PromptRecord): PromptSummary {
	return {
		id: prompt.id,
		title: prompt.title,
		folderId: prompt.folderId,
		createdAt: prompt.createdAt,
		updatedAt: prompt.updatedAt,
		excerpt: prompt.bodyMarkdown.replace(/\s+/g, " ").trim().slice(0, 120),
	};
}

function replacePromptSummary(current: PromptSummary[], next: PromptSummary): PromptSummary[] {
	const remaining = current.filter((entry) => entry.id !== next.id);
	return [next, ...remaining].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function mergePromptSummaries(
	current: PromptSummary[],
	nextForFolder: PromptSummary[],
	folderId: string,
): PromptSummary[] {
	const preserved = current.filter((prompt) => prompt.folderId !== folderId);
	return [...preserved, ...nextForFolder].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function folderNameFor(folderId: string, folders: FolderRecord[]): string {
	return folders.find((folder) => folder.id === folderId)?.name ?? "Unknown Folder";
}

function formatTimestamp(value: string): string {
	return new Date(value).toLocaleDateString([], {
		month: "short",
		day: "numeric",
	});
}

function formatDateTime(value: string): string {
	return new Date(value).toLocaleString([], {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function sortFolders(left: FolderRecord, right: FolderRecord): number {
	return left.name.localeCompare(right.name);
}

function toMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return "Something went wrong.";
}

export default App;
