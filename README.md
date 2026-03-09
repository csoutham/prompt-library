# Your Prompt Library

`v0.8.2`

Your Prompt Library is a local-first macOS desktop app for collecting AI prompts in folders. It is built with Electrobun, Bun, React, and a file-backed Markdown store so prompts stay readable and portable on disk.

## What ships in v0.8.2

- Folder tree with nested folders
- Parent and child folders only, with inline subfolder creation on parent rows
- Distinct subfolder creation icon in the folder tree
- Native macOS Edit menu support for Select All, Copy, Paste, Undo, and Redo in text fields
- macOS menubar shortcut with folders, subfolders, and one-click prompt copy
- Menubar actions to reopen the app or quit directly from the status bar
- Full-height app shell with pane-contained scrolling instead of page-level vertical overflow
- Prompt list for the current folder
- Full-width sort and search controls in the prompt list
- Header import/export actions with larger icon treatment
- Hidden macOS title bar with a draggable in-app header
- Markdown editor with direct title editing
- Full-height `Contents` editor with `Stats` docked at the bottom
- Move prompts between folders and subfolders from the editor toolbar
- Search across prompt titles and body text
- Autosave on edit
- Copy prompt content to the clipboard with visible confirmation
- Import library from a JSON export
- Export library to a JSON snapshot
- In-app confirmations for destructive actions and imports
- Actionable empty states for first-run use
- Autosave-safe prompt titles with spaces preserved while editing
- Keyboard shortcuts for search, create, save, and dialog dismissal
- Folder prompt counts and prompt sorting controls
- Fixed three-column workspace without collapsible panes
- Focused editor workspace without a right-side preview pane
- Prompt deletion moved into the editor toolbar next to copy
- Header shortcuts button with in-app modal reference
- Bare folder rename/delete icons that appear on hover
- Refreshed editorial desktop UI with stronger panel hierarchy and app chrome
- Icon-based utility controls for faster scanning and lighter chrome
- Reduced secondary action chrome with icon-led folder and prompt utilities
- Phosphor iconography for cleaner control alignment and more coherent button chrome
- File-backed local storage under the app's user-data directory
- TestFlight packaging script and release checklist in [TESTFLIGHT.md](/Users/Chris/Work/Projects/Apps/Prompt%20Store/macos/TESTFLIGHT.md)

## Development

```bash
bun install
bun run dev:hmr
```

If you prefer the bundled desktop flow without Vite HMR:

```bash
bun run start
```

## Testing

```bash
bun run test
```

## Production build

```bash
bun run build
```

## TestFlight package

```bash
bun run package:testflight
```

## Storage layout

Prompt data is stored locally in the app user-data directory:

- `library/folders.json` contains folder metadata
- `library/prompts/<prompt-id>.md` contains one prompt per Markdown file with frontmatter metadata

That layout is intentionally simple so the app can later grow into import/export or sync features without replacing the core model.
