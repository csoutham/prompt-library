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
	mac: {
		target: ["dir"],
		category: "public.app-category.productivity",
		icon: "assets/AppIcon.icns",
		minimumSystemVersion: "12.0",
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
	},
};
