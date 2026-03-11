import type { CloudKitPullPayload, CloudKitPushPlan } from "./cloudkit";
import type { CloudKitSyncState } from "./prompt-store";

export type CloudKitBridgeCommand =
	| "health"
	| "describeConfig"
	| "accountStatus"
	| "ensureZone"
	| "pullChanges"
	| "pushChanges";

export type CloudKitBridgeRequest = {
	id: string;
	command: CloudKitBridgeCommand;
	payload?: Record<string, string>;
};

export type CloudKitBridgeResponse = {
	id: string;
	ok: boolean;
	result?: Record<string, string>;
	error?: string;
};

export type CloudKitBridgePullResponse = {
	payload: CloudKitPullPayload;
	syncState: CloudKitSyncState;
};

export type CloudKitBridgePushResponse = {
	savedRecords: string[];
	deletedRecords: string[];
};

export function serializeSyncState(state: CloudKitSyncState): string {
	return JSON.stringify(state);
}

export function parseBridgePullResponse(payloadJson: string): CloudKitBridgePullResponse {
	return JSON.parse(payloadJson) as CloudKitBridgePullResponse;
}

export function serializePushPlan(plan: CloudKitPushPlan): string {
	return JSON.stringify(plan);
}

export function parseBridgePushResponse(payloadJson: string): CloudKitBridgePushResponse {
	return JSON.parse(payloadJson) as CloudKitBridgePushResponse;
}
