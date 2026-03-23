import { ClockCounterClockwise, DownloadSimple, Keyboard, UploadSimple } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
	AutoExportSettings,
	AutoExportState,
	FolderRecord,
	PromptRecord,
	PromptSummary,
} from "../shared/prompt-store";
import { promptStoreApi } from "./api";
import { AutoExportDialog } from "./components/AutoExportDialog";
import { EditorPanel } from "./components/EditorPanel";
import { FolderTree } from "./components/FolderTree";
import { LibraryDialog } from "./components/LibraryDialog";
import { PromptListPanel } from "./components/PromptListPanel";
import type { DialogState } from "./dialogState";
import {
	DEFAULT_PROMPT_TITLE,
	folderNameFor,
	mergePromptSummaries,
	replacePromptSummary,
	sortFolders,
	sortPrompts,
	summarizePrompt,
	type SortMode,
} from "./promptLibrary";

function App() {
	const [sortMode, setSortMode] = useState<SortMode>("updated");
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
	const [autoExportState, setAutoExportState] = useState<AutoExportState | null>(null);
	const [autoExportDraft, setAutoExportDraft] = useState<AutoExportSettings | null>(null);
	const [isAutoExportDialogOpen, setIsAutoExportDialogOpen] = useState(false);
	const [isSavingAutoExport, setIsSavingAutoExport] = useState(false);
	const [autoExportErrorMessage, setAutoExportErrorMessage] = useState<string | null>(null);
	const [dialogValue, setDialogValue] = useState("");
	const [isSubmittingDialog, setIsSubmittingDialog] = useState(false);
	const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
	const [isEditingDefaultTitle, setIsEditingDefaultTitle] = useState(false);
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const dialogInputRef = useRef<HTMLInputElement | null>(null);
	const autoExportRetentionInputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		void loadInitialState();
	}, []);

	useEffect(() => {
		if (!selectedPrompt) {
			return;
		}

		setDraftTitle(selectedPrompt.title);
		setDraftBody(selectedPrompt.bodyMarkdown);
		setIsEditingDefaultTitle(false);
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

		if (
			isEditingDefaultTitle &&
			selectedPrompt.title === DEFAULT_PROMPT_TITLE &&
			selectedPrompt.bodyMarkdown.trim() === "" &&
			draftTitle.trim() === "" &&
			draftBody.trim() === ""
		) {
			return;
		}

		const timeout = window.setTimeout(() => {
			void saveCurrentPrompt();
		}, 350);

		return () => window.clearTimeout(timeout);
	}, [draftBody, draftTitle, isEditingDefaultTitle, selectedPrompt]);

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
			setCopiedPromptId((current) => (current === copiedPromptId ? null : current));
		}, 1500);

		return () => window.clearTimeout(timeout);
	}, [copiedPromptId]);

	const visiblePrompts = useMemo(() => {
		const base = searchQuery.trim()
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
			const [payload, nextAutoExportState] = await Promise.all([
				promptStoreApi.bootstrap(),
				promptStoreApi.getAutoExportSettings(),
			]);
			setFolders(payload.folders);
			setPromptSummaries(payload.prompts);
			setAutoExportState(nextAutoExportState);

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

	function handleTitleFocus() {
		if (
			selectedPrompt?.title === DEFAULT_PROMPT_TITLE &&
			selectedPrompt.bodyMarkdown.trim() === "" &&
			draftTitle === DEFAULT_PROMPT_TITLE &&
			draftBody.trim() === ""
		) {
			setDraftTitle("");
			setIsEditingDefaultTitle(true);
		}
	}

	function handleTitleBlur() {
		if (isEditingDefaultTitle && draftTitle.trim() === "" && draftBody.trim() === "") {
			setDraftTitle(DEFAULT_PROMPT_TITLE);
		}
		setIsEditingDefaultTitle(false);
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

	function closeAutoExportDialog() {
		setIsAutoExportDialogOpen(false);
		setAutoExportErrorMessage(null);
		if (autoExportState) {
			setAutoExportDraft(autoExportState.settings);
		}
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
					const folder = await promptStoreApi.createFolder(dialogValue, dialog.parentId);
					setFolders((current) => [...current, folder].sort(sortFolders));
					setSelectedFolderId(folder.id);
					setSelectedPrompt(null);
					setDraftTitle("");
					setDraftBody("");
					setStatusMessage(`Created folder "${folder.name}"`);
					break;
				}
				case "rename-folder": {
					const folder = await promptStoreApi.renameFolder(dialog.folderId, dialogValue);
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
					const nextFolders = folders.filter((folder) => folder.id !== dialog.folderId);
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

	async function openAutoExportDialog() {
		try {
			const nextState = await promptStoreApi.getAutoExportSettings();
			setAutoExportState(nextState);
			setAutoExportDraft(nextState.settings);
			setAutoExportErrorMessage(null);
			setIsAutoExportDialogOpen(true);
		} catch (error) {
			setErrorMessage(toMessage(error));
		}
	}

	async function chooseAutoExportFolder() {
		try {
			const nextState = await promptStoreApi.chooseAutoExportFolder();
			setAutoExportState(nextState);
			setAutoExportDraft(nextState.settings);
			setAutoExportErrorMessage(null);
		} catch (error) {
			setAutoExportErrorMessage(toMessage(error));
		}
	}

	async function saveAutoExportSettings() {
		if (!autoExportDraft) {
			return;
		}

		setIsSavingAutoExport(true);
		setAutoExportErrorMessage(null);
		try {
			const nextState = await promptStoreApi.saveAutoExportSettings(autoExportDraft);
			setAutoExportState(nextState);
			setAutoExportDraft(nextState.settings);
			setStatusMessage("Saved automatic export settings");
			setIsAutoExportDialogOpen(false);
		} catch (error) {
			setAutoExportErrorMessage(toMessage(error));
		} finally {
			setIsSavingAutoExport(false);
		}
	}

	async function runAutoExportNow() {
		if (!autoExportDraft) {
			return;
		}

		setIsSavingAutoExport(true);
		setAutoExportErrorMessage(null);
		try {
			const savedState = await promptStoreApi.saveAutoExportSettings(autoExportDraft);
			const nextState = await promptStoreApi.runAutoExportNow();
			setAutoExportState(nextState);
			setAutoExportDraft(nextState.settings);
			setStatusMessage(
				nextState.status.lastErrorMessage
					? nextState.status.lastErrorMessage
					: "Exported library snapshot",
			);
			if (savedState.status.lastErrorMessage && !nextState.status.lastErrorMessage) {
				setAutoExportErrorMessage(null);
			}
		} catch (error) {
			setAutoExportErrorMessage(toMessage(error));
		} finally {
			setIsSavingAutoExport(false);
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

	function openMovePromptDialog() {
		if (!selectedPrompt) {
			return;
		}

		openDialog({
			type: "move-prompt",
			title: "Move prompt",
			description: `Move "${selectedPrompt.title}" to another folder or subfolder.`,
			submitLabel: "Move Prompt",
			promptId: selectedPrompt.id,
			initialFolderId: selectedPrompt.folderId,
		});
	}

	function openDeletePromptDialog() {
		if (!selectedPrompt) {
			return;
		}

		openDialog({
			type: "delete-prompt",
			title: "Delete prompt",
			description: `Delete "${selectedPrompt.title}". This cannot be undone.`,
			submitLabel: "Delete Prompt",
			promptId: selectedPrompt.id,
		});
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
						aria-label="Automatic exports"
						title="Automatic exports"
						onClick={() => void openAutoExportDialog()}
					>
						<ClockCounterClockwise
							className="button__icon-svg button__icon-svg--large"
							aria-hidden="true"
						/>
					</button>
					<button
						className="button button--icon"
						aria-label="Export library"
						title="Export library"
						onClick={() => void exportLibrary()}
					>
						<DownloadSimple
							className="button__icon-svg button__icon-svg--large"
							aria-hidden="true"
						/>
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
						<UploadSimple
							className="button__icon-svg button__icon-svg--large"
							aria-hidden="true"
						/>
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
						<FolderTree
							folders={folders}
							parentId={null}
							selectedFolderId={selectedFolderId}
							onSelect={selectFolder}
							folderPromptCounts={folderPromptCounts}
							onCreateChild={(folder) =>
								openDialog({
									type: "create-folder",
									title: "New subfolder",
									description: `Create a child folder inside "${folder.name}".`,
									submitLabel: "Create Subfolder",
									initialValue: "New Folder",
									parentId: folder.id,
								})
							}
							onRename={(folder) =>
								openDialog({
									type: "rename-folder",
									title: "Rename folder",
									description: "Update the folder name.",
									submitLabel: "Rename Folder",
									initialValue: folder.name,
									folderId: folder.id,
								})
							}
							onDelete={(folder) =>
								openDialog({
									type: "delete-folder",
									title: "Delete folder",
									description: `Delete "${folder.name}". Non-empty folders are blocked.`,
									submitLabel: "Delete Folder",
									folderId: folder.id,
								})
							}
						/>
					</div>
				</aside>

				<PromptListPanel
					searchQuery={searchQuery}
					selectedFolderName={searchQuery ? "Search Results" : selectedFolder?.name ?? "Library"}
					sortMode={sortMode}
					searchInputRef={searchInputRef}
					selectedFolderId={selectedFolderId}
					selectedPromptId={selectedPrompt?.id ?? null}
					visiblePrompts={visiblePrompts}
					folders={folders}
					onSortModeChange={setSortMode}
					onSearchChange={(query) => void handleSearchChange(query)}
					onCreatePrompt={createPrompt}
					onSelectPrompt={selectPrompt}
				/>

				<EditorPanel
					selectedPrompt={selectedPrompt}
					selectedFolderId={selectedFolderId}
					folders={folders}
					draftTitle={draftTitle}
					draftBody={draftBody}
					copiedPromptId={copiedPromptId}
					onDraftTitleChange={setDraftTitle}
					onDraftBodyChange={setDraftBody}
					onTitleFocus={handleTitleFocus}
					onTitleBlur={handleTitleBlur}
					onCopyPrompt={copyPrompt}
					onMovePrompt={openMovePromptDialog}
					onDeletePrompt={openDeletePromptDialog}
					onCreatePrompt={createPrompt}
				/>
			</div>

			{dialog ? (
				<LibraryDialog
					dialog={dialog}
					dialogValue={dialogValue}
					isSubmittingDialog={isSubmittingDialog}
					folders={folders}
					dialogInputRef={dialogInputRef}
					onDialogValueChange={setDialogValue}
					onClose={closeDialog}
					onSubmit={submitDialog}
				/>
			) : null}
			{isAutoExportDialogOpen && autoExportState && autoExportDraft ? (
				<AutoExportDialog
					draft={autoExportDraft}
					state={autoExportState}
					errorMessage={autoExportErrorMessage}
					isSubmitting={isSavingAutoExport}
					retentionInputRef={autoExportRetentionInputRef}
					onDraftChange={setAutoExportDraft}
					onChooseFolder={chooseAutoExportFolder}
					onRunNow={runAutoExportNow}
					onClose={closeAutoExportDialog}
					onSave={saveAutoExportSettings}
				/>
			) : null}
		</div>
	);
}

function toMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return "Something went wrong.";
}

export default App;
