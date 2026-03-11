# Your Prompt Library

`v0.9.24`

Your Prompt Library is a local-first macOS desktop app for collecting AI prompts in folders. It is built with Electron, Bun, React, and a file-backed Markdown store so prompts stay readable and portable on disk.

## What ships in v0.9.24

- Folder tree with nested folders
- Parent and child folders only, with inline subfolder creation on parent rows
- Distinct subfolder creation icon in the folder tree
- Electron shell with a preload bridge instead of the previous Electrobun runtime
- Bun installs now explicitly run Electron's binary installer so local `dev:hmr` and `start` runs have a usable `Electron.app`
- Mac App Store-oriented Electron Builder packaging configuration
- Electron Builder config moved into a JS config file so provisioning profile paths resolve from environment variables correctly
- Electron-based TestFlight packaging script for MAS builds
- TestFlight packaging script now detects Electron Builder MAS packages inside nested `release/mas-*` output folders
- MAS signing now relies on Electron Builder's automatic App Store identity selection instead of a hard-coded certificate name
- Arm64-only distribution now declares a minimum macOS version of 12.0 for App Store Connect compliance
- Electron Builder now uses a dedicated `AppIcon.icns` asset to satisfy App Store Connect icon validation
- Vite now emits relative asset URLs so the packaged `file://` renderer loads correctly in production and TestFlight
- Header dragging now uses Electron's native `-webkit-app-region` behavior so the window can be moved normally on macOS
- Editor and pane layout now keep the main window fixed while large pasted prompt content scrolls inside the `Contents` field
- Brand-new prompts now clear the default `Untitled Prompt` title on first focus, without autosaving that temporary empty state
- Prompt list previews now use a smaller excerpt size and clamp to three lines for cleaner scanning
- Editable fields now get a native Electron right-click menu with standard edit actions and spelling suggestions
- Icon-only controls now expose clearer hover titles across the editor and folder tree
- The folder tree's create-subfolder icon now uses a sharper weight to match the rest of the action set
- The file-backed prompt store is now split into a dedicated `FilePromptRepository` with a stable `PromptStore` wrapper API
- A local `FileSyncStateStore` now persists future CloudKit cursors and sync timestamps separately from prompt content
- CloudKit folder and prompt record mapping now lives in a shared contract layer, ready for a future sync service
- A `CloudKitSyncService` now builds push plans from local records and tombstones, so sync work can be staged without touching the UI
- The CloudKit prep layer can now apply pulled records back into the local store, including conflict-copy creation for prompt content collisions
- Successful outbound CloudKit plans can now be acknowledged locally so pushed records move to `synced` state and record names are retained
- The repo now locks in the private CloudKit target as `iCloud.com.cjsoutham.promptlibrary` and includes MAS entitlements for CloudKit-enabled builds
- CloudKit implementation notes now live in [CLOUDKIT.md](/Users/Chris/Work/Projects/Apps/PromptStore/macos/CLOUDKIT.md)
- A native Swift `CloudKitBridge` helper now lives inside the repo and is built into `build/native/CloudKitBridge`
- Electron now has a JSON-over-stdin bridge client for CloudKit helper calls, with build scripts that package the native helper alongside the app
- MAS CloudKit entitlements now explicitly pin `com.apple.developer.icloud-container-environment` to `Production` for TestFlight/App Store validation
- Native app menu labels now use `Your Prompt Library`, and the tray uses an Electron-friendly PNG template icon
- App bundles now declare `ITSAppUsesNonExemptEncryption=false` in `Info.plist` to align with the export compliance exemption path
- Packaged tray icon lookup now reads from the app bundle path used in production, not just the dev filesystem layout
- Data records now carry sync metadata and tombstone fields, preparing the local-first store for a future CloudKit sync layer
- Prompt store types now expose a repository-shaped interface for future file-store and CloudKit-backed implementations
- Native macOS Edit menu support for Select All, Copy, Paste, Undo, and Redo in text fields
- macOS menubar shortcut with folders, subfolders, and one-click prompt copy
- Menubar actions to reopen the app or quit directly from the status bar
- Custom monochrome tray icon derived from the main app icon for a more native macOS menubar look
- Full-height app shell with pane-contained scrolling instead of page-level vertical overflow
- Non-selectable app title in the header for cleaner chrome behavior
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

If a machine was installed before this fix and the Electron binary is still missing, rerun:

```bash
bun install
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
