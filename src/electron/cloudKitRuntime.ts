import type { PromptStore } from "../bun/promptStore";
import type { CloudKitRuntimeStatus } from "../shared/cloudkit";
import { CloudKitBridgeClient } from "./cloudKitBridge";

export class CloudKitRuntimeService {
	private syncTimer: Timer | null = null;
	private syncInFlight: Promise<void> | null = null;
	private status: CloudKitRuntimeStatus = {
		available: false,
		accountStatus: "unknown",
		syncInFlight: false,
		lastSyncAt: null,
		lastError: null,
	};

	constructor(
		private readonly promptStore: PromptStore,
		private readonly bridge: CloudKitBridgeClient,
	) {}

	scheduleSync(delayMs = 1500) {
		if (this.syncTimer) {
			clearTimeout(this.syncTimer);
		}

		this.syncTimer = setTimeout(() => {
			this.syncTimer = null;
			void this.syncNow();
		}, delayMs);
	}

	async syncNow() {
		if (this.syncInFlight) {
			return this.syncInFlight;
		}

		this.status = {
			...this.status,
			syncInFlight: true,
			lastError: null,
		};
		this.syncInFlight = this.runSync().finally(() => {
			this.syncInFlight = null;
			this.status = {
				...this.status,
				syncInFlight: false,
			};
		});
		return this.syncInFlight;
	}

	getStatus(): CloudKitRuntimeStatus {
		return this.status;
	}

	private async runSync() {
		try {
			const status = await this.bridge.accountStatus();
			this.status = {
				...this.status,
				accountStatus: status.result?.accountStatus ?? "unknown",
				available: status.result?.accountStatus === "available",
			};
			if (status.result?.accountStatus !== "available") {
				return;
			}

			await this.bridge.ensureZone();

			const syncState = await this.promptStore.readSyncState();
			const pullResponse = await this.bridge.pullChanges(syncState);
			await this.promptStore.applyCloudKitPullPayload(pullResponse.payload);
			await this.promptStore.writeSyncState(pullResponse.syncState);

			const plan = await this.promptStore.buildCloudKitPushPlan();
			const hasPushWork =
				plan.foldersToSave.length > 0 ||
				plan.promptsToSave.length > 0 ||
				plan.recordsToDelete.length > 0;

			if (!hasPushWork) {
				await this.promptStore.markCloudKitSyncCompleted({
					lastSyncAt: new Date().toISOString(),
				});
				this.status = {
					...this.status,
					lastSyncAt: new Date().toISOString(),
				};
				return;
			}

			await this.bridge.pushChanges(plan);
			await this.promptStore.acknowledgeCloudKitPushPlan(plan, {
				lastSyncAt: new Date().toISOString(),
			});
			this.status = {
				...this.status,
				lastSyncAt: new Date().toISOString(),
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.status = {
				...this.status,
				lastError: message,
			};
			console.warn("[CloudKit] sync skipped:", error);
		}
	}
}
