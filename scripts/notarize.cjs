const path = require("node:path");
const { notarize } = require("@electron/notarize");

module.exports = async function notarizeApp(context) {
	if (process.env.BUILD_CHANNEL !== "direct") {
		return;
	}

	if (context.electronPlatformName !== "darwin") {
		return;
	}

	const appleId = process.env.APPLE_ID;
	const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
	const teamId = process.env.APPLE_TEAM_ID;

	if (!appleId || !appleIdPassword || !teamId) {
		console.log("Skipping notarisation - Apple notarisation credentials are not set.");
		return;
	}

	const appPath = path.join(
		context.appOutDir,
		`${context.packager.appInfo.productFilename}.app`,
	);

	console.log(`Submitting ${appPath} for notarisation...`);
	await notarize({
		appBundleId: context.packager.appInfo.id,
		appPath,
		appleId,
		appleIdPassword,
		teamId,
	});
};
