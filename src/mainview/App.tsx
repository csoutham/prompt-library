import { useEffect, useMemo, useRef, useState } from "react";
import {
	ArrowBendUpRight,
	CaretDown,
	Check,
	Copy,
	DownloadSimple,
	FolderSimpleDashed,
	PencilSimple,
	Keyboard,
	Trash,
	UploadSimple,
} from "@phosphor-icons/react";
import type {
	FolderRecord,
	PromptRecord,
	PromptSummary,
} from "../shared/prompt-store";
import { promptStoreApi } from "./api";

type DialogState =
	| {
			type: "create-folder";
			title: string;
			description: string;
			submitLabel: string;
			initialValue: string;
			parentId: string | null;
	  }
	| {
			type: "rename-folder";
			title: string;
			description: string;
			submitLabel: string;
			initialValue: string;
			folderId: string;
	  }
	| {
			type: "delete-folder";
			title: string;
			description: string;
			submitLabel: string;
			folderId: string;
	  }
	| {
			type: "delete-prompt";
			title: string;
			description: string;
			submitLabel: string;
			promptId: string;
	  }
	| {
			type: "move-prompt";
			title: string;
			description: string;
			submitLabel: string;
			promptId: string;
			initialFolderId: string;
	  }
	| {
			type: "import-library";
			title: string;
			description: string;
			submitLabel: string;
	  }
	| {
			type: "shortcuts";
			title: string;
			description: string;
			submitLabel: string;
	  }
	| null;

function App() {
	const [sortMode, setSortMode] = useState<"updated" | "title" | "created">("updated");
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
	const [dialog, setDialog] = useState<DialogState>(null);
	const [dialogValue, setDialogValue] = useState("");
	const [isSubmittingDialog, setIsSubmittingDialog] = useState(false);
	const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const dialogInputRef = useRef<HTMLInputElement | null>(null);

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

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			const meta = event.metaKey || event.ctrlKey;
			const target = event.target as HTMLElement | null;
			const isEditableTarget =
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target?.isContentEditable === true;

			if (event.key === "Escape" && dialog) {
				event.preventDefault();
				closeDialog();
				return;
			}

			if (!meta) {
				return;
			}

			if (event.key.toLowerCase() === "f") {
				event.preventDefault();
				searchInputRef.current?.focus();
				searchInputRef.current?.select();
				return;
			}

			if (event.key.toLowerCase() === "s" && selectedPrompt) {
				event.preventDefault();
				void saveCurrentPrompt();
				return;
			}

			if (event.key.toLowerCase() === "n" && event.shiftKey) {
				event.preventDefault();
				openDialog({
					type: "create-folder",
					title: "New folder",
					description: "Create a top-level folder for a new group of prompts.",
					submitLabel: "Create Folder",
					initialValue: "New Folder",
					parentId: null,
				});
				return;
			}

			if (event.key.toLowerCase() === "n" && !isEditableTarget && selectedFolderId) {
				event.preventDefault();
				void createPrompt();
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [dialog, selectedFolderId, selectedPrompt, draftTitle, draftBody]);

	useEffect(() => {
		if (dialog && "initialValue" in dialog) {
			dialogInputRef.current?.focus();
			dialogInputRef.current?.select();
		}
	}, [dialog]);

	useEffect(() => {
		if (!copiedPromptId) {
			return;
		}

		const timeout = window.setTimeout(() => {
			setCopiedPromptId((current) =>
				current === copiedPromptId ? null : current,
			);
		}, 1500);

		return () => window.clearTimeout(timeout);
	}, [copiedPromptId]);

	const visiblePrompts = useMemo(() => {
		const base =
			searchQuery.trim()
				? promptSummaries
				: selectedFolderId
					? promptSummaries.filter((prompt) => prompt.folderId === selectedFolderId)
					: [];

		return [...base].sort((left, right) => sortPrompts(left, right, sortMode));
	}, [promptSummaries, searchQuery, selectedFolderId, sortMode]);

	const folderPromptCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const prompt of promptSummaries) {
			counts.set(prompt.folderId, (counts.get(prompt.folderId) ?? 0) + 1);
		}
		return counts;
	}, [promptSummaries]);

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

			const initialPromptId = payload.prompts.find(
				(prompt) => prompt.folderId === initialFolderId,
			)?.id;
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

	async function refreshFolder(folderId: string | null) {
		if (!folderId) {
			setSelectedPrompt(null);
			return;
		}

		const prompts = await promptStoreApi.listPrompts(folderId);
		setPromptSummaries((current) => mergePromptSummaries(current, prompts, folderId));
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

	function openDialog(nextDialog: DialogState) {
		setDialog(nextDialog);
		if (nextDialog && "initialValue" in nextDialog) {
			setDialogValue(nextDialog.initialValue);
			return;
		}
		if (nextDialog?.type === "move-prompt") {
			setDialogValue(nextDialog.initialFolderId);
			return;
		}
		setDialogValue("");
	}

	function closeDialog() {
		setDialog(null);
		setDialogValue("");
		setIsSubmittingDialog(false);
	}

	async function submitDialog() {
		if (!dialog) {
			return;
		}

		setIsSubmittingDialog(true);
		setErrorMessage(null);

		try {
			switch (dialog.type) {
				case "create-folder": {
					const folder = await promptStoreApi.createFolder(
						dialogValue,
						dialog.parentId,
					);
					setFolders((current) => [...current, folder].sort(sortFolders));
					setSelectedFolderId(folder.id);
					setSelectedPrompt(null);
					setDraftTitle("");
					setDraftBody("");
					setStatusMessage(`Created folder "${folder.name}"`);
					break;
				}
				case "rename-folder": {
					const folder = await promptStoreApi.renameFolder(
						dialog.folderId,
						dialogValue,
					);
					setFolders((current) =>
						current
							.map((entry) => (entry.id === folder.id ? folder : entry))
							.sort(sortFolders),
					);
					setStatusMessage(`Renamed folder to "${folder.name}"`);
					break;
				}
				case "delete-folder": {
					await promptStoreApi.deleteFolder(dialog.folderId);
					const nextFolders = folders.filter(
						(folder) => folder.id !== dialog.folderId,
					);
					const fallbackFolder = nextFolders[0] ?? null;
					setFolders(nextFolders);
					setSelectedFolderId(fallbackFolder?.id ?? null);
					setSelectedPrompt(null);
					setDraftTitle("");
					setDraftBody("");
					await refreshFolder(fallbackFolder?.id ?? null);
					setStatusMessage("Deleted folder");
					break;
				}
				case "delete-prompt": {
					await promptStoreApi.deletePrompt(dialog.promptId);
					const nextSummaries = promptSummaries.filter(
						(prompt) => prompt.id !== dialog.promptId,
					);
					setPromptSummaries(nextSummaries);

					const fallbackPromptId = nextSummaries.find(
						(prompt) => prompt.folderId === selectedFolderId,
					)?.id;
					if (fallbackPromptId) {
						const prompt = await promptStoreApi.getPrompt(fallbackPromptId);
						setSelectedPrompt(prompt);
					} else {
						setSelectedPrompt(null);
						setDraftTitle("");
						setDraftBody("");
					}
					setStatusMessage("Deleted prompt");
					break;
				}
				case "move-prompt": {
					const moved = await promptStoreApi.movePrompt(dialog.promptId, dialogValue);
					setPromptSummaries((current) =>
						replacePromptSummary(current, summarizePrompt(moved)),
					);
					if (selectedPrompt?.id === moved.id) {
						setSelectedPrompt(moved);
					}
					if (searchQuery.trim()) {
						const results = await promptStoreApi.searchPrompts(searchQuery);
						setPromptSummaries(results);
					} else if (selectedFolderId) {
						const prompts = await promptStoreApi.listPrompts(selectedFolderId);
						setPromptSummaries((current) =>
							mergePromptSummaries(current, prompts, selectedFolderId),
						);
						if (moved.folderId !== selectedFolderId) {
							setSelectedPrompt(null);
							setDraftTitle("");
							setDraftBody("");
						}
					}
					setStatusMessage(`Moved prompt to "${folderNameFor(moved.folderId, folders)}"`);
					break;
				}
				case "import-library": {
					const result = await promptStoreApi.importLibrary();
					if (!result.imported) {
						closeDialog();
						return;
					}
					await loadInitialState();
					setStatusMessage("Imported library snapshot");
					break;
				}
				case "shortcuts":
					closeDialog();
					return;
			}

			closeDialog();
		} catch (error) {
			setIsSubmittingDialog(false);
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

	async function copyPrompt() {
		if (!selectedPrompt) {
			return;
		}

		try {
			await promptStoreApi.copyPrompt(selectedPrompt.id);
			setCopiedPromptId(selectedPrompt.id);
			setStatusMessage(`Copied "${selectedPrompt.title}"`);
		} catch (error) {
			setErrorMessage(toMessage(error));
		}
	}

	async function exportLibrary() {
		try {
			const result = await promptStoreApi.exportLibrary();
			if (!result.filePath) {
				return;
			}
			setStatusMessage(`Exported library to ${result.filePath}`);
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
				setPromptSummaries((current) =>
					mergePromptSummaries(current, prompts, selectedFolderId),
				);
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
			const saved = await promptStoreApi.savePrompt(
				selectedPrompt.id,
				draftTitle,
				draftBody,
			);
			setSelectedPrompt(saved);
			setPromptSummaries((current) =>
				replacePromptSummary(current, summarizePrompt(saved)),
			);
			setStatusMessage(
				`Saved ${new Date(saved.updatedAt).toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
				})}`,
			);
		} catch (error) {
			setErrorMessage(toMessage(error));
		} finally {
			setIsSaving(false);
		}
	}

	if (isLoading) {
		return <div className="loading-shell">Loading your prompt library…</div>;
	}

	return (
		<div className="app-shell">
			<div className="app-live-region" aria-live="polite">
				{errorMessage ?? (isSaving ? "Autosaving…" : statusMessage)}
			</div>
			<header className="app-topbar">
				<div className="app-topbar__brand">
					<h1>Your prompt library</h1>
				</div>
				<div className="app-topbar__meta">
					<button
						className="button button--icon"
						aria-label="Export library"
						title="Export library"
						onClick={() => void exportLibrary()}
					>
						<DownloadSimple className="button__icon-svg button__icon-svg--large" aria-hidden="true" />
					</button>
					<button
						className="button button--icon"
						aria-label="Import library"
						title="Import library"
						onClick={() =>
							openDialog({
								type: "import-library",
								title: "Import library",
								description:
									"Choose a previously exported JSON snapshot. This replaces the current library on disk.",
								submitLabel: "Choose Import File",
							})
						}
					>
						<UploadSimple className="button__icon-svg button__icon-svg--large" aria-hidden="true" />
					</button>
					<button
						className="button button--icon"
						aria-label="Show shortcuts"
						title="Show shortcuts"
						onClick={() =>
							openDialog({
								type: "shortcuts",
								title: "Keyboard shortcuts",
								description: "Quick actions for moving through the library.",
								submitLabel: "Close",
							})
						}
					>
						<Keyboard className="button__icon-svg" aria-hidden="true" />
					</button>
				</div>
			</header>
			<div className="app-frame">
				<aside className="sidebar">
					<div className="sidebar__controls">
						<button
							className="button button--primary"
							onClick={() =>
								openDialog({
									type: "create-folder",
									title: "New folder",
									description: "Create a top-level folder for a new group of prompts.",
									submitLabel: "Create Folder",
									initialValue: "New Folder",
									parentId: null,
								})
							}
						>
							New Folder
						</button>
					</div>

					<div className="folder-tree">
						{renderFolderTree(
							folders,
							null,
							selectedFolderId,
							selectFolder,
							folderPromptCounts,
							(folder) =>
								openDialog({
									type: "create-folder",
									title: "New subfolder",
									description: `Create a child folder inside "${folder.name}".`,
									submitLabel: "Create Subfolder",
									initialValue: "New Folder",
									parentId: folder.id,
								}),
							(folder) =>
								openDialog({
									type: "rename-folder",
									title: "Rename folder",
									description: "Update the folder name.",
									submitLabel: "Rename Folder",
									initialValue: folder.name,
									folderId: folder.id,
								}),
							(folder) =>
								openDialog({
									type: "delete-folder",
									title: "Delete folder",
									description: `Delete "${folder.name}". Non-empty folders are blocked.`,
									submitLabel: "Delete Folder",
									folderId: folder.id,
								}),
						)}
					</div>
				</aside>

				<section className="prompt-list-panel">
					<div className="panel-header">
						<h2>{searchQuery ? "Search Results" : selectedFolder?.name ?? "Library"}</h2>
						<button
							className="button button--primary"
							disabled={!selectedFolderId}
							onClick={() => void createPrompt()}
						>
							New Prompt
						</button>
					</div>

					<div className="prompt-list-toolbar">
						<label className="sort-field">
							<span>Sort</span>
							<div className="select-shell">
								<select
									value={sortMode}
									onChange={(event) =>
										setSortMode(event.target.value as "updated" | "title" | "created")
									}
								>
									<option value="updated">Recently updated</option>
									<option value="created">Recently created</option>
									<option value="title">Title</option>
								</select>
								<CaretDown className="select-shell__icon" aria-hidden="true" weight="bold" />
							</div>
						</label>
						<label className="search-field">
							<span>Search</span>
							<input
								ref={searchInputRef}
								value={searchQuery}
								onChange={(event) => void handleSearchChange(event.target.value)}
								placeholder="Search titles and Markdown"
							/>
						</label>
					</div>

					<div className="prompt-list">
						{visiblePrompts.length === 0 ? (
							<div className="empty-state">
								<p>No prompts yet.</p>
								<span>Create one in this folder to start your library.</span>
								<button
									className="button button--primary"
									disabled={!selectedFolderId}
									onClick={() => void createPrompt()}
								>
									Create First Prompt
								</button>
							</div>
						) : (
							visiblePrompts.map((prompt) => (
								<button
									key={prompt.id}
									className={`prompt-card ${
										selectedPrompt?.id === prompt.id ? "prompt-card--active" : ""
									}`}
									onClick={() => void selectPrompt(prompt.id)}
								>
									<div className="prompt-card__header">
										<div className="prompt-card__title">{prompt.title}</div>
										<ArrowBendUpRight
											className="prompt-card__chevron"
											aria-hidden="true"
											weight="bold"
										/>
									</div>
									<div className="prompt-card__excerpt">
										{prompt.excerpt || "Empty prompt"}
									</div>
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
							<button
								className="button button--icon"
								disabled={!selectedPrompt}
								aria-label="Move prompt"
								title="Move prompt"
								onClick={() =>
									selectedPrompt &&
									openDialog({
										type: "move-prompt",
										title: "Move prompt",
										description: `Move "${selectedPrompt.title}" to another folder or subfolder.`,
										submitLabel: "Move Prompt",
										promptId: selectedPrompt.id,
										initialFolderId: selectedPrompt.folderId,
									})
								}
							>
								<FolderSimpleDashed className="button__icon-svg" aria-hidden="true" />
							</button>
							<button
								className={`button button--icon ${
									copiedPromptId === selectedPrompt?.id ? "button--success" : ""
								}`}
								disabled={!selectedPrompt}
								aria-label={copiedPromptId === selectedPrompt?.id ? "Copied" : "Copy prompt"}
								title={copiedPromptId === selectedPrompt?.id ? "Copied" : "Copy prompt"}
								onClick={() => void copyPrompt()}
							>
								{copiedPromptId === selectedPrompt?.id ? (
									<Check className="button__icon-svg" aria-hidden="true" weight="bold" />
								) : (
									<Copy className="button__icon-svg" aria-hidden="true" />
								)}
							</button>
							<button
								className="button button--icon button--danger"
								disabled={!selectedPrompt}
								aria-label="Delete prompt"
								title="Delete prompt"
								onClick={() =>
									selectedPrompt &&
									openDialog({
										type: "delete-prompt",
										title: "Delete prompt",
										description: `Delete "${selectedPrompt.title}". This cannot be undone.`,
										submitLabel: "Delete Prompt",
										promptId: selectedPrompt.id,
									})
								}
							>
								<Trash className="button__icon-svg" aria-hidden="true" />
							</button>
						</div>
					</div>

					{selectedPrompt ? (
						<div className="editor-pane">
							<label className="editor-field">
								<span>Title</span>
								<input
									value={draftTitle}
									onChange={(event) => setDraftTitle(event.target.value)}
								/>
							</label>
							<label className="editor-field editor-field--body">
								<span>Contents</span>
								<textarea
									value={draftBody}
									onChange={(event) => setDraftBody(event.target.value)}
									placeholder="# Prompt title&#10;&#10;Write the reusable instructions here."
								/>
							</label>
							<div className="editor-ribbon editor-ribbon--footer">
								<span className="editor-ribbon__label">Stats</span>
								<span className="editor-ribbon__value">
									{draftBody.trim() ? `${draftBody.trim().split(/\s+/).length} words` : "Empty draft"}
								</span>
							</div>
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
						</div>
					) : (
						<div className="empty-state empty-state--editor">
							<p>Choose a prompt or create a new one.</p>
							<span>Markdown autosaves after you pause typing.</span>
							<button
								className="button button--primary"
								disabled={!selectedFolderId}
								onClick={() => void createPrompt()}
							>
								New Prompt
							</button>
						</div>
					)}
				</section>
			</div>

			{dialog ? (
				<div className="dialog-scrim" onClick={() => closeDialog()}>
					<div className="dialog-card" onClick={(event) => event.stopPropagation()}>
						<p className="eyebrow">{dialog.title}</p>
						<h3>{dialog.title}</h3>
						<p className="dialog-card__description">{dialog.description}</p>

						{"initialValue" in dialog ? (
							<label className="editor-field">
								<span>Name</span>
								<input
									ref={dialogInputRef}
									value={dialogValue}
									onChange={(event) => setDialogValue(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											event.preventDefault();
											void submitDialog();
										}
									}}
								/>
							</label>
						) : null}

						{dialog.type === "move-prompt" ? (
							<label className="editor-field">
								<span>Destination folder</span>
								<div className="select-shell">
									<select
										value={dialogValue}
										onChange={(event) => setDialogValue(event.target.value)}
									>
										{folders.map((folder) => (
											<option key={folder.id} value={folder.id}>
												{folderPathLabel(folder, folders)}
											</option>
										))}
									</select>
									<CaretDown className="select-shell__icon" aria-hidden="true" weight="bold" />
								</div>
							</label>
						) : null}

						{dialog.type === "shortcuts" ? (
							<div className="shortcut-list">
								<div className="shortcut-card__row">
									<span>Search</span>
									<kbd>Cmd F</kbd>
								</div>
								<div className="shortcut-card__row">
									<span>New prompt</span>
									<kbd>Cmd N</kbd>
								</div>
								<div className="shortcut-card__row">
									<span>New folder</span>
									<kbd>Cmd Shift N</kbd>
								</div>
								<div className="shortcut-card__row">
									<span>Save</span>
									<kbd>Cmd S</kbd>
								</div>
								<div className="shortcut-card__row">
									<span>Dismiss dialog</span>
									<kbd>Esc</kbd>
								</div>
							</div>
						) : null}

						<div className="dialog-card__actions">
							<button className="button" onClick={() => closeDialog()}>
								Cancel
							</button>
							<button
								className={`button ${
									dialog.type.includes("delete")
										? "button--danger"
										: "button--primary"
								}`}
								disabled={
									isSubmittingDialog ||
									(("initialValue" in dialog && dialogValue.trim().length === 0) ||
										(dialog.type === "move-prompt" && dialogValue.trim().length === 0))
								}
								onClick={() => void submitDialog()}
							>
								{isSubmittingDialog ? "Working…" : dialog.submitLabel}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}

function renderFolderTree(
	folders: FolderRecord[],
	parentId: string | null,
	selectedFolderId: string | null,
	onSelect: (folderId: string) => void | Promise<void>,
	folderPromptCounts: Map<string, number>,
	onCreateChild: (folder: FolderRecord) => void,
	onRename: (folder: FolderRecord) => void,
	onDelete: (folder: FolderRecord) => void,
) {
	return folders
		.filter((folder) => folder.parentId === parentId)
		.map((folder) => (
			<div key={folder.id} className="folder-tree__branch">
				<div
					className={`folder-tree__row ${
						selectedFolderId === folder.id ? "folder-tree__row--active" : ""
					}`}
				>
					<button
						className={`folder-tree__item ${
							selectedFolderId === folder.id ? "folder-tree__item--active" : ""
						}`}
						onClick={() => void onSelect(folder.id)}
					>
						<span className="folder-tree__item-label">
							<span className="folder-tree__dot" />
							<span>{folder.name}</span>
						</span>
						<span className="folder-tree__count">
							{folderPromptCounts.get(folder.id) ?? 0}
						</span>
					</button>
					<div className="folder-tree__actions">
						{folder.parentId === null ? (
							<button
								className="folder-tree__action"
								aria-label={`Create subfolder in ${folder.name}`}
								title="Create subfolder"
								onClick={() => onCreateChild(folder)}
							>
								<FolderSimpleDashed className="button__icon-svg" aria-hidden="true" />
							</button>
						) : null}
						<button
							className="folder-tree__action"
							aria-label={`Rename ${folder.name}`}
							title="Rename folder"
							onClick={() => onRename(folder)}
						>
							<PencilSimple className="button__icon-svg" aria-hidden="true" />
						</button>
						<button
							className="folder-tree__action folder-tree__action--danger"
							aria-label={`Delete ${folder.name}`}
							title="Delete folder"
							onClick={() => onDelete(folder)}
						>
							<Trash className="button__icon-svg" aria-hidden="true" />
						</button>
					</div>
				</div>
				<div className="folder-tree__children">
					{renderFolderTree(
						folders,
						folder.id,
						selectedFolderId,
						onSelect,
						folderPromptCounts,
						onCreateChild,
						onRename,
						onDelete,
					)}
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

function replacePromptSummary(
	current: PromptSummary[],
	next: PromptSummary,
): PromptSummary[] {
	const remaining = current.filter((entry) => entry.id !== next.id);
	return [next, ...remaining].sort((left, right) =>
		right.updatedAt.localeCompare(left.updatedAt),
	);
}

function mergePromptSummaries(
	current: PromptSummary[],
	nextForFolder: PromptSummary[],
	folderId: string,
): PromptSummary[] {
	const preserved = current.filter((prompt) => prompt.folderId !== folderId);
	return [...preserved, ...nextForFolder].sort((left, right) =>
		right.updatedAt.localeCompare(left.updatedAt),
	);
}

function folderNameFor(folderId: string, folders: FolderRecord[]): string {
	return folders.find((folder) => folder.id === folderId)?.name ?? "Unknown Folder";
}

function folderPathLabel(folder: FolderRecord, folders: FolderRecord[]): string {
	const names: string[] = [folder.name];
	let parentId = folder.parentId;

	while (parentId) {
		const parent = folders.find((entry) => entry.id === parentId);
		if (!parent) {
			break;
		}
		names.unshift(parent.name);
		parentId = parent.parentId;
	}

	return names.join(" / ");
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

function sortPrompts(
	left: PromptSummary,
	right: PromptSummary,
	mode: "updated" | "title" | "created",
): number {
	switch (mode) {
		case "title":
			return left.title.localeCompare(right.title);
		case "created":
			return right.createdAt.localeCompare(left.createdAt);
		case "updated":
		default:
			return right.updatedAt.localeCompare(left.updatedAt);
	}
}

function toMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return "Something went wrong.";
}

export default App;
