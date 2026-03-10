# TestFlight Prep

This project is prepared for a macOS TestFlight submission path built from Electron Builder targeting the Mac App Store.

## What is already configured

- Hidden native title bar with an in-app draggable header
- Stable release build script: `bun run build:stable`
- Electron main process and preload bridge for the existing React renderer
- Electron Builder config at [electron-builder.config.cjs](/Users/Chris/Work/Projects/Apps/PromptStore/macos/electron-builder.config.cjs)
- MAS entitlements at [entitlements.mas.plist](/Users/Chris/Work/Projects/Apps/PromptStore/macos/config/entitlements.mas.plist) and [entitlements.mas.inherit.plist](/Users/Chris/Work/Projects/Apps/PromptStore/macos/config/entitlements.mas.inherit.plist)
- App icon asset at [AppIcon.icns](/Users/Chris/Work/Projects/Apps/PromptStore/macos/assets/AppIcon.icns)
- Tray icon asset at [tray-icon.png](/Users/Chris/Work/Projects/Apps/PromptStore/macos/assets/tray-icon.png)
- TestFlight-oriented signed build script: `bun run build:testflight`
- Signed installer packaging script: `bun run package:testflight`

## Required environment variables

- `APP_PROVISION_PROFILE` (required)
  Absolute path to the installed `Mac App Store Connect` provisioning profile for `com.cjsoutham.promptlibrary`

## Build the upload package

```bash
export APP_PROVISION_PROFILE="$HOME/Library/MobileDevice/Provisioning Profiles/<your-profile>.provisionprofile"

bun install
bun run package:testflight
```

The resulting upload artifact is:

- `release/mas-*/Your Prompt Library-<version>-arm64.pkg`

## Submission checklist

1. Create the macOS app in App Store Connect with bundle ID `com.cjsoutham.promptlibrary`.
2. Ensure the Mac App Store signing identities and provisioning profile are installed in Keychain and the local profile directory.
3. Run `bun run package:testflight`.
4. Validate the generated package locally:
   - `pkgutil --check-signature release/*.pkg`
5. Upload the package with Transporter or Xcode Organizer.
6. Add TestFlight internal testers first, then external testers after App Review if needed.

## Notes

- The bundle identifier is configured as `com.cjsoutham.promptlibrary` in `package.json`.
- The Team ID for this release path is `EUGLUJ6T59`.
- The app uses the macOS app sandbox in TestFlight mode and allows read/write access only to user-selected files outside its app container.
- The Electron Builder MAS target is intended to replace the earlier Electrobun-based App Store packaging path that failed Transporter ingestion.
- MAS signing uses Electron Builder's automatic matching against the provisioning profile rather than a hard-coded `3rd Party Mac Developer Application` name.
- The app is configured as arm64-only and declares `minimumSystemVersion` of `12.0`, which App Store Connect requires for non-universal macOS uploads.
- The renderer build uses relative asset paths so the packaged `file://` app can load its JS and CSS correctly outside the dev server.
- The app `Info.plist` sets `ITSAppUsesNonExemptEncryption=false`; this helps App Store Connect treat the build as exempt, but the App Store Connect compliance UI may still need to be completed once.
- The tray icon is loaded from the packaged app path so it works in both dev and production builds.
- If you need App Store-specific metadata next, the remaining work is App Store Connect setup rather than code changes.
