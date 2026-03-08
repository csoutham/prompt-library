# Prompt Store

`v0.3.1`

Prompt Store is a local-first macOS desktop app for collecting AI prompts in folders. It is built with Electrobun, Bun, React, and a file-backed Markdown store so prompts stay readable and portable on disk.

## What ships in v0.3.1

- Folder tree with nested folders
- Prompt list for the current folder
- Markdown editor with live preview
- Search across prompt titles and body text
- Autosave on edit
- Copy prompt content to the clipboard
- Import library from a JSON export
- Export library to a JSON snapshot
- In-app confirmations for destructive actions and imports
- Actionable empty states for first-run use
- Autosave-safe prompt titles with spaces preserved while editing
- Keyboard shortcuts for search, create, save, and dialog dismissal
- Folder prompt counts and prompt sorting controls
- File-backed local storage under the app's user-data directory

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

## Storage layout

Prompt data is stored locally in the app user-data directory:

- `library/folders.json` contains folder metadata
- `library/prompts/<prompt-id>.md` contains one prompt per Markdown file with frontmatter metadata

That layout is intentionally simple so the app can later grow into import/export or sync features without replacing the core model.
