import type { ElectrobunConfig } from "electrobun";

const isTestFlightRelease = process.env.ELECTROBUN_TARGET === "testflight";
const appIdentifier = process.env.APP_BUNDLE_ID ?? "com.cjsoutham.promptlibrary";

export default {
	app: {
		name: "Your Prompt Library",
		identifier: appIdentifier,
		version: "0.8.3",
	},
	build: {
		// Vite builds to dist/, we copy from there
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
			"assets/tray-icon.svg": "views/mainview/tray-icon.svg",
		},
		// Ignore Vite output in watch mode — HMR handles view rebuilds separately
		watchIgnore: ["dist/**"],
		mac: {
			codesign: isTestFlightRelease,
			notarize: false,
			bundleCEF: false,
			icons: "assets/icon.iconset",
			entitlements: {
				"com.apple.security.app-sandbox": isTestFlightRelease,
				"com.apple.security.files.user-selected.read-write": true,
				"com.apple.security.cs.allow-jit": true,
				"com.apple.security.cs.allow-unsigned-executable-memory": true,
				"com.apple.security.cs.disable-library-validation": true,
			},
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
