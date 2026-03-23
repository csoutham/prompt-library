const buildChannel = process.env.BUILD_CHANNEL ?? "local";
const isDirectBuild = buildChannel === "direct";

/** @type {import('electron-builder').Configuration} */
module.exports = {
	appId: "com.cjsoutham.promptlibrary",
	productName: "Your Prompt Library",
	directories: {
		output: "release",
	},
	files: [
		"build/electron/**/*",
		"dist/**/*",
		"assets/tray-icon.svg",
		"assets/tray-icon.png",
		"package.json",
	],
	asar: true,
	afterSign: isDirectBuild ? "scripts/notarize.cjs" : undefined,
	mac: {
		target: isDirectBuild ? ["dmg", "zip"] : ["dir"],
		category: "public.app-category.productivity",
		icon: "assets/AppIcon.icns",
		minimumSystemVersion: "12.0",
		hardenedRuntime: isDirectBuild,
		entitlements: isDirectBuild ? "config/entitlements.mac.plist" : undefined,
		entitlementsInherit: isDirectBuild ? "config/entitlements.mac.inherit.plist" : undefined,
		extendInfo: {
			ITSAppUsesNonExemptEncryption: false,
		},
	},
	mas: {
		icon: "assets/AppIcon.icns",
		provisioningProfile: process.env.APP_PROVISION_PROFILE,
		entitlements: "config/entitlements.mas.plist",
		entitlementsInherit: "config/entitlements.mas.inherit.plist",
		hardenedRuntime: false,
		gatekeeperAssess: false,
		type: "distribution",
		target: ["mas"],
		extendInfo: {
			ITSAppUsesNonExemptEncryption: false,
		},
	},
};
