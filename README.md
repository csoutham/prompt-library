# Your Prompt Library

`v1.0.0`

Your Prompt Library is a local-first macOS desktop app for collecting AI prompts in folders. It is built with Electron, Bun, React, and a file-backed Markdown store so prompts stay readable and portable on disk.

## What ships in v1.0.0

- Folder tree with parent and child folders
- Folder hover actions now sit inline within the full-width folder row, to the left of the prompt count
- Folder hover actions now stay hidden until hover, even for the currently selected folder
- Prompt files now load safely even when YAML frontmatter dates are parsed back as native `Date` objects
- Prompt list for the selected folder
- Markdown editor with autosave
- Search across prompt titles and contents
- Copy prompt content instantly
- Import and export library snapshots as JSON
- Menubar access for browsing folders and copying prompts
- Native macOS edit menu support for text fields
- Electron Builder packaging for local builds and TestFlight submission
- File-backed local storage under the app's user-data directory

Cloud sync is intentionally not part of the current release. For now, moving data between devices is handled with import and export.

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

That layout is intentionally simple so the app can grow later without replacing the core model.
