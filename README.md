# Your Prompt Library

`v1.1.0`

Your Prompt Library is a local-first macOS desktop app for collecting AI prompts in folders. It is built with Electron, Bun, React, and a file-backed Markdown store so prompts stay readable and portable on disk.

## Availability

This version has been approved for distribution on the Mac App Store and is now available here:

- [Your Prompt Library on the Mac App Store](https://apps.apple.com/app/your-prompt-library/id6760317091)

## What ships in v1.1.0

- Folder tree with parent and child folders
- Prompt list for the selected folder
- Markdown editor with autosave
- Search across prompt titles and contents
- Copy prompt content instantly
- Import and export library snapshots as JSON
- Automatic exports to a chosen folder on an hourly, 6-hourly, daily, or weekly schedule
- Rolling snapshot mode and timestamped backup mode with retention
- Menubar access for browsing folders and copying prompts
- Native macOS edit menu support for text fields
- Electron Builder packaging for local builds and TestFlight submission
- File-backed local storage under the app's user-data directory

Cloud sync is intentionally not part of the current release. For now, moving data between devices is handled with import, export, and optional automatic backup exports into a synced folder such as Dropbox.

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

## Direct download package

```bash
bun run package:direct
```

For signed and notarised direct-download builds plus GitHub Release automation, see [DIRECT-DISTRIBUTION.md](/Users/Chris/Work/Projects/Apps/PromptStore/macos/DIRECT-DISTRIBUTION.md).

## TestFlight package

```bash
bun run package:testflight
```

## Storage layout

Prompt data is stored locally in the app user-data directory:

- `library/folders.json` contains folder metadata
- `library/prompts/<prompt-id>.md` contains one prompt per Markdown file with frontmatter metadata

That layout is intentionally simple so the app can grow later without replacing the core model.
