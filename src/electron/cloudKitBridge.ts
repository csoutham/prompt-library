import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";
import { app } from "electron";
import {
	CloudKitBridgeCommand,
	CloudKitBridgeRequest,
	CloudKitBridgeResponse,
	parseBridgePullResponse,
	parseBridgePushResponse,
	serializePushPlan,
	serializeSyncState,
} from "../shared/cloudkit-bridge";
import { CLOUDKIT_DEFAULTS } from "../shared/cloudkit-config";
import type { CloudKitPushPlan } from "../shared/cloudkit";
import type { CloudKitSyncState } from "../shared/prompt-store";
import type {
	CloudKitBridgePullResponse,
	CloudKitBridgePushResponse,
} from "../shared/cloudkit-bridge";

type PendingRequest = {
	resolve: (response: CloudKitBridgeResponse) => void;
	reject: (error: Error) => void;
};

export class CloudKitBridgeClient {
	private process: ChildProcessWithoutNullStreams | null = null;
	private buffer = "";
	private pending = new Map<string, PendingRequest>();

	async healthCheck() {
		return this.send("health");
	}

	async describeConfig() {
		return this.send("describeConfig", {
			containerId: CLOUDKIT_DEFAULTS.containerId,
			databaseScope: CLOUDKIT_DEFAULTS.databaseScope,
			zoneName: CLOUDKIT_DEFAULTS.zoneName,
		});
	}

	async accountStatus() {
		return this.send("accountStatus", {
			containerId: CLOUDKIT_DEFAULTS.containerId,
		});
	}

	async ensureZone() {
		return this.send("ensureZone", {
			containerId: CLOUDKIT_DEFAULTS.containerId,
			zoneName: CLOUDKIT_DEFAULTS.zoneName,
		});
	}

	async pullChanges(syncState: CloudKitSyncState): Promise<CloudKitBridgePullResponse> {
		const response = await this.send("pullChanges", {
			containerId: CLOUDKIT_DEFAULTS.containerId,
			zoneName: CLOUDKIT_DEFAULTS.zoneName,
			syncStateJson: serializeSyncState(syncState),
		});
		const payloadJson = response.result?.payloadJson;
		if (!payloadJson) {
			throw new Error("CloudKit bridge did not return pull payload.");
		}
		return parseBridgePullResponse(payloadJson);
	}

	async pushChanges(plan: CloudKitPushPlan): Promise<CloudKitBridgePushResponse> {
		const response = await this.send("pushChanges", {
			containerId: CLOUDKIT_DEFAULTS.containerId,
			zoneName: CLOUDKIT_DEFAULTS.zoneName,
			planJson: serializePushPlan(plan),
		});
		const payloadJson = response.result?.payloadJson;
		if (!payloadJson) {
			throw new Error("CloudKit bridge did not return push payload.");
		}
		return parseBridgePushResponse(payloadJson);
	}

	async dispose() {
		if (!this.process) {
			return;
		}

		this.process.kill();
		this.process = null;
		this.buffer = "";
		for (const pending of this.pending.values()) {
			pending.reject(new Error("CloudKit bridge stopped."));
		}
		this.pending.clear();
	}

	private async send(
		command: CloudKitBridgeCommand,
		payload?: Record<string, string>,
	): Promise<CloudKitBridgeResponse> {
		this.ensureProcess();
		const id = randomUUID();
		const request: CloudKitBridgeRequest = { id, command, payload };

		return new Promise<CloudKitBridgeResponse>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.process?.stdin.write(`${JSON.stringify(request)}\n`);
		});
	}

	private ensureProcess() {
		if (this.process) {
			return;
		}

		const executablePath = resolveBridgeExecutablePath();
		if (!existsSync(executablePath)) {
			throw new Error(
				`CloudKit bridge is missing at ${executablePath}. Run bun run build:cloudkit-bridge.`,
			);
		}

		this.process = spawn(executablePath, [], {
			stdio: ["pipe", "pipe", "pipe"],
		});

		this.process.stdout.setEncoding("utf8");
		this.process.stdout.on("data", (chunk: string) => {
			this.buffer += chunk;
			this.flushBuffer();
		});

		this.process.stderr.setEncoding("utf8");
		this.process.stderr.on("data", (chunk: string) => {
			this.rejectAll(new Error(`CloudKit bridge error: ${chunk.trim()}`));
		});

		this.process.on("exit", (code) => {
			this.process = null;
			this.rejectAll(new Error(`CloudKit bridge exited with code ${code ?? "unknown"}.`));
		});
	}

	private flushBuffer() {
		while (true) {
			const newlineIndex = this.buffer.indexOf("\n");
			if (newlineIndex === -1) {
				return;
			}

			const line = this.buffer.slice(0, newlineIndex).trim();
			this.buffer = this.buffer.slice(newlineIndex + 1);
			if (!line) {
				continue;
			}

			let response: CloudKitBridgeResponse;
			try {
				response = JSON.parse(line) as CloudKitBridgeResponse;
			} catch (error) {
				this.rejectAll(
					error instanceof Error ? error : new Error("Invalid CloudKit bridge response."),
				);
				return;
			}

			const pending = this.pending.get(response.id);
			if (!pending) {
				continue;
			}
			this.pending.delete(response.id);

			if (response.ok) {
				pending.resolve(response);
			} else {
				pending.reject(new Error(response.error ?? "CloudKit bridge request failed."));
			}
		}
	}

	private rejectAll(error: Error) {
		for (const pending of this.pending.values()) {
			pending.reject(error);
		}
		this.pending.clear();
	}
}

function resolveBridgeExecutablePath() {
	if (app.isPackaged) {
		return join(process.resourcesPath, "native", "CloudKitBridge");
	}

	return join(app.getAppPath(), "build", "native", "CloudKitBridge");
}
