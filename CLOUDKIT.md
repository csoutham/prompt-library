# CloudKit Direction

This app is being prepared for CloudKit sync with these defaults:

- Container: `iCloud.com.cjsoutham.promptlibrary`
- Database scope: `private`
- Zone: `prompt-library`

## Product intent

- Sync should follow the signed-in user's iCloud account
- Data should stay private to that user across their Macs
- The app should stay local-first, with CloudKit layered on top rather than replacing the local file store

## Build behavior

- The same sync model should be used across local, TestFlight, and App Store builds
- In practice, CloudKit uses separate development and production environments
- Local development normally targets the development environment
- TestFlight and App Store builds use the production environment after the schema is deployed

## Current code state

- File-backed storage is isolated in [filePromptRepository.ts](/Users/Chris/Work/Projects/Apps/PromptStore/macos/src/bun/filePromptRepository.ts)
- Sync cursors and timestamps are isolated in [syncStateStore.ts](/Users/Chris/Work/Projects/Apps/PromptStore/macos/src/bun/syncStateStore.ts)
- Record mapping and sync plan types live in [cloudkit.ts](/Users/Chris/Work/Projects/Apps/PromptStore/macos/src/shared/cloudkit.ts)
- The selected container and scope live in [cloudkit-config.ts](/Users/Chris/Work/Projects/Apps/PromptStore/macos/src/shared/cloudkit-config.ts)

## Native bridge

This repo now includes a native Swift helper at [native/CloudKitBridge](/Users/Chris/Work/Projects/Apps/PromptStore/macos/native/CloudKitBridge) and an Electron-side client at [cloudKitBridge.ts](/Users/Chris/Work/Projects/Apps/PromptStore/macos/src/electron/cloudKitBridge.ts).

Current bridge commands:

- `health`
- `describeConfig`
- `accountStatus`
- `ensureZone`
- `pullChanges`
- `pushChanges`

Build it with:

```bash
bun run build:cloudkit-bridge
```

## Runtime wiring

Electron now owns a small runtime service at [cloudKitRuntime.ts](/Users/Chris/Work/Projects/Apps/PromptStore/macos/src/electron/cloudKitRuntime.ts) that:

- checks iCloud account status
- ensures the private custom zone exists
- pulls remote changes into the local store
- builds outbound save and delete plans from local changes
- pushes those changes back to CloudKit

## Important implementation note

Electron still does not get direct CloudKit access by itself. The remaining implementation work is mostly:

- validating live signed builds against the private database
- deciding how much sync status to expose in the renderer UI
- expanding the bridge if CloudKit-specific error handling or subscriptions become necessary
