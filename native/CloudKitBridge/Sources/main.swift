import CloudKit
import Foundation

struct RequestEnvelope: Decodable {
	let id: String
	let command: String
	let payload: [String: String]?
}

struct ResponseEnvelope: Encodable {
	let id: String
	let ok: Bool
	let result: [String: String]?
	let error: String?
}

struct SyncStateEnvelope: Codable {
	let version: Int
	let databaseChangeToken: String?
	let zoneChangeTokens: [String: String?]
	let lastSyncAt: String?
	let lastFullSyncAt: String?
}

struct PushPlanEnvelope: Codable {
	let generatedAt: String
	let foldersToSave: [FolderRecordEnvelope]
	let promptsToSave: [PromptRecordEnvelope]
	let recordsToDelete: [DeleteRecordEnvelope]
}

struct PullResponseEnvelope: Codable {
	let payload: PullPayloadEnvelope
	let syncState: SyncStateEnvelope
}

struct PushResponseEnvelope: Codable {
	let savedRecords: [String]
	let deletedRecords: [String]
}

struct PullPayloadEnvelope: Codable {
	let folders: [FolderRecordEnvelope]
	let prompts: [PromptRecordEnvelope]
	let deletedRecords: [DeleteRecordEnvelope]
}

struct FolderRecordEnvelope: Codable {
	let recordType: String
	let recordName: String
	let zoneName: String
	let fields: FolderFieldsEnvelope
}

struct FolderFieldsEnvelope: Codable {
	let folderId: String
	let name: String
	let parentId: String?
	let createdAt: String
	let updatedAt: String
	let deletedAt: String?
	let syncStatus: String
}

struct PromptRecordEnvelope: Codable {
	let recordType: String
	let recordName: String
	let zoneName: String
	let fields: PromptFieldsEnvelope
}

struct PromptFieldsEnvelope: Codable {
	let promptId: String
	let title: String
	let folderId: String
	let bodyMarkdown: String
	let createdAt: String
	let updatedAt: String
	let deletedAt: String?
	let syncStatus: String
}

struct DeleteRecordEnvelope: Codable {
	let recordType: String
	let recordName: String
	let zoneName: String
	let deletedAt: String
}

let bridgeEncoder: JSONEncoder = {
	let encoder = JSONEncoder()
	encoder.outputFormatting = [.withoutEscapingSlashes]
	return encoder
}()

let bridgeDecoder = JSONDecoder()

@main
struct CloudKitBridgeApp {
	static func main() async {
		let output = FileHandle.standardOutput

		while let line = readLine(strippingNewline: true), !line.isEmpty {
			do {
				let request = try bridgeDecoder.decode(RequestEnvelope.self, from: Data(line.utf8))
				let response = try await handle(request: request)
				let data = try bridgeEncoder.encode(response)
				output.write(data)
				output.write(Data([0x0A]))
			} catch {
				let fallback = ResponseEnvelope(
					id: "unknown",
					ok: false,
					result: nil,
					error: error.localizedDescription
				)
				if let data = try? bridgeEncoder.encode(fallback) {
					output.write(data)
					output.write(Data([0x0A]))
				}
			}
		}
	}
}

func handle(request: RequestEnvelope) async throws -> ResponseEnvelope {
	switch request.command {
	case "health":
		return ResponseEnvelope(
			id: request.id,
			ok: true,
			result: [
				"bridge": "CloudKitBridge",
				"platform": "macOS",
			],
			error: nil
		)
	case "describeConfig":
		let containerId = request.payload?["containerId"] ?? ""
		let scope = request.payload?["databaseScope"] ?? "private"
		let zoneName = request.payload?["zoneName"] ?? "prompt-library"
		return ResponseEnvelope(
			id: request.id,
			ok: true,
			result: [
				"containerId": containerId,
				"databaseScope": scope,
				"zoneName": zoneName,
			],
			error: nil
		)
	case "accountStatus":
		let containerId = request.payload?["containerId"] ?? ""
		let status = try await fetchAccountStatus(containerId: containerId)
		return ResponseEnvelope(
			id: request.id,
			ok: true,
			result: [
				"containerId": containerId,
				"accountStatus": status,
			],
			error: nil
		)
	case "ensureZone":
		let context = try contextFromPayload(request.payload)
		try await ensureZone(context: context)
		return ResponseEnvelope(
			id: request.id,
			ok: true,
			result: [
				"containerId": context.containerId,
				"zoneName": context.zoneName,
			],
			error: nil
		)
	case "pullChanges":
		let context = try contextFromPayload(request.payload)
		let syncState = try decodeSyncState(from: request.payload?["syncStateJson"])
		let response = try await pullChanges(context: context, syncState: syncState)
		return ResponseEnvelope(
			id: request.id,
			ok: true,
			result: [
				"payloadJson": encodeJson(response),
			],
			error: nil
		)
	case "pushChanges":
		let context = try contextFromPayload(request.payload)
		let pushPlan = try decodePushPlan(from: request.payload?["planJson"])
		let response = try await pushChanges(context: context, plan: pushPlan)
		return ResponseEnvelope(
			id: request.id,
			ok: true,
			result: [
				"payloadJson": encodeJson(response),
			],
			error: nil
		)
	default:
		return ResponseEnvelope(
			id: request.id,
			ok: false,
			result: nil,
			error: "Unsupported command: \(request.command)"
		)
	}
}

struct BridgeContext {
	let containerId: String
	let zoneName: String
}

func contextFromPayload(_ payload: [String: String]?) throws -> BridgeContext {
	guard let containerId = payload?["containerId"], !containerId.isEmpty else {
		throw BridgeError.invalidPayload("Missing containerId")
	}
	let zoneName = payload?["zoneName"] ?? "prompt-library"
	return BridgeContext(containerId: containerId, zoneName: zoneName)
}

func fetchAccountStatus(containerId: String) async throws -> String {
	let container = CKContainer(identifier: containerId)
	return try await withCheckedThrowingContinuation { continuation in
		container.accountStatus { status, error in
			if let error {
				continuation.resume(throwing: error)
				return
			}

			continuation.resume(returning: encode(status: status))
		}
	}
}

func ensureZone(context: BridgeContext) async throws {
	let zoneID = CKRecordZone.ID(zoneName: context.zoneName, ownerName: CKCurrentUserDefaultName)
	let zone = CKRecordZone(zoneID: zoneID)
	let operation = CKModifyRecordZonesOperation(recordZonesToSave: [zone], recordZoneIDsToDelete: nil)
	try await perform(operation: operation, in: privateDatabase(containerId: context.containerId))
}

func pullChanges(context: BridgeContext, syncState: SyncStateEnvelope) async throws -> PullResponseEnvelope {
	try await ensureZone(context: context)

	let zoneID = CKRecordZone.ID(zoneName: context.zoneName, ownerName: CKCurrentUserDefaultName)
	let zoneToken = decodeServerChangeToken(syncState.zoneChangeTokens[context.zoneName] ?? nil)
	let config = CKFetchRecordZoneChangesOperation.ZoneConfiguration()
	config.previousServerChangeToken = zoneToken

	var folders: [FolderRecordEnvelope] = []
	var prompts: [PromptRecordEnvelope] = []
	var deletedRecords: [DeleteRecordEnvelope] = []
	var nextZoneTokenBase64: String?

	let operation = CKFetchRecordZoneChangesOperation(
		recordZoneIDs: [zoneID],
		configurationsByRecordZoneID: [zoneID: config]
	)

	operation.recordWasChangedBlock = { recordID, result in
		switch result {
		case .success(let record):
			if let envelope = envelopeFromRecord(record) {
				switch envelope {
				case .folder(let folder):
					folders.append(folder)
				case .prompt(let prompt):
					prompts.append(prompt)
				}
			}
		case .failure:
			break
		}
	}

	operation.recordWithIDWasDeletedBlock = { recordID, recordType in
		deletedRecords.append(
			DeleteRecordEnvelope(
				recordType: recordType,
				recordName: recordID.recordName,
				zoneName: context.zoneName,
				deletedAt: ISO8601DateFormatter().string(from: Date())
			)
		)
	}

	operation.recordZoneFetchResultBlock = { _, result in
		if case .success(let response) = result {
			nextZoneTokenBase64 = encodeServerChangeToken(response.serverChangeToken)
		}
	}

	try await perform(operation: operation, in: privateDatabase(containerId: context.containerId))

	return PullResponseEnvelope(
		payload: PullPayloadEnvelope(
			folders: folders,
			prompts: prompts,
			deletedRecords: deletedRecords
		),
		syncState: SyncStateEnvelope(
			version: 1,
			databaseChangeToken: syncState.databaseChangeToken,
			zoneChangeTokens: [
				context.zoneName: nextZoneTokenBase64,
			],
			lastSyncAt: ISO8601DateFormatter().string(from: Date()),
			lastFullSyncAt: syncState.lastFullSyncAt
		)
	)
}

func pushChanges(context: BridgeContext, plan: PushPlanEnvelope) async throws -> PushResponseEnvelope {
	try await ensureZone(context: context)

	let recordsToSave = plan.foldersToSave.map(recordFromEnvelope) + plan.promptsToSave.map(recordFromEnvelope)
	let recordsToDelete = plan.recordsToDelete.map {
		CKRecord.ID(recordName: $0.recordName, zoneID: CKRecordZone.ID(zoneName: $0.zoneName, ownerName: CKCurrentUserDefaultName))
	}

	let operation = CKModifyRecordsOperation(recordsToSave: recordsToSave, recordIDsToDelete: recordsToDelete)
	operation.savePolicy = .changedKeys

	var savedRecordNames: [String] = []
	var deletedRecordNames: [String] = []

	operation.perRecordSaveBlock = { recordID, result in
		if case .success = result {
			savedRecordNames.append(recordID.recordName)
		}
	}

	operation.perRecordDeleteBlock = { recordID, result in
		if case .success = result {
			deletedRecordNames.append(recordID.recordName)
		}
	}

	try await perform(operation: operation, in: privateDatabase(containerId: context.containerId))

	return PushResponseEnvelope(
		savedRecords: savedRecordNames,
		deletedRecords: deletedRecordNames
	)
}

enum DecodedRecordEnvelope {
	case folder(FolderRecordEnvelope)
	case prompt(PromptRecordEnvelope)
}

func envelopeFromRecord(_ record: CKRecord) -> DecodedRecordEnvelope? {
	switch record.recordType {
	case "PromptFolder":
		return .folder(
			FolderRecordEnvelope(
				recordType: record.recordType,
				recordName: record.recordID.recordName,
				zoneName: record.recordID.zoneID.zoneName,
				fields: FolderFieldsEnvelope(
					folderId: stringField(record, "folderId"),
					name: stringField(record, "name"),
					parentId: optionalStringField(record, "parentId"),
					createdAt: stringField(record, "createdAt"),
					updatedAt: stringField(record, "updatedAt"),
					deletedAt: optionalStringField(record, "deletedAt"),
					syncStatus: stringField(record, "syncStatus")
				)
			)
		)
	case "Prompt":
		return .prompt(
			PromptRecordEnvelope(
				recordType: record.recordType,
				recordName: record.recordID.recordName,
				zoneName: record.recordID.zoneID.zoneName,
				fields: PromptFieldsEnvelope(
					promptId: stringField(record, "promptId"),
					title: stringField(record, "title"),
					folderId: stringField(record, "folderId"),
					bodyMarkdown: stringField(record, "bodyMarkdown"),
					createdAt: stringField(record, "createdAt"),
					updatedAt: stringField(record, "updatedAt"),
					deletedAt: optionalStringField(record, "deletedAt"),
					syncStatus: stringField(record, "syncStatus")
				)
			)
		)
	default:
		return nil
	}
}

func recordFromEnvelope(_ envelope: FolderRecordEnvelope) -> CKRecord {
	let recordID = CKRecord.ID(
		recordName: envelope.recordName,
		zoneID: CKRecordZone.ID(zoneName: envelope.zoneName, ownerName: CKCurrentUserDefaultName)
	)
	let record = CKRecord(recordType: envelope.recordType, recordID: recordID)
	record["folderId"] = envelope.fields.folderId as CKRecordValue
	record["name"] = envelope.fields.name as CKRecordValue
	if let parentId = envelope.fields.parentId {
		record["parentId"] = parentId as CKRecordValue
	}
	record["createdAt"] = envelope.fields.createdAt as CKRecordValue
	record["updatedAt"] = envelope.fields.updatedAt as CKRecordValue
	if let deletedAt = envelope.fields.deletedAt {
		record["deletedAt"] = deletedAt as CKRecordValue
	}
	record["syncStatus"] = envelope.fields.syncStatus as CKRecordValue
	return record
}

func recordFromEnvelope(_ envelope: PromptRecordEnvelope) -> CKRecord {
	let recordID = CKRecord.ID(
		recordName: envelope.recordName,
		zoneID: CKRecordZone.ID(zoneName: envelope.zoneName, ownerName: CKCurrentUserDefaultName)
	)
	let record = CKRecord(recordType: envelope.recordType, recordID: recordID)
	record["promptId"] = envelope.fields.promptId as CKRecordValue
	record["title"] = envelope.fields.title as CKRecordValue
	record["folderId"] = envelope.fields.folderId as CKRecordValue
	record["bodyMarkdown"] = envelope.fields.bodyMarkdown as CKRecordValue
	record["createdAt"] = envelope.fields.createdAt as CKRecordValue
	record["updatedAt"] = envelope.fields.updatedAt as CKRecordValue
	if let deletedAt = envelope.fields.deletedAt {
		record["deletedAt"] = deletedAt as CKRecordValue
	}
	record["syncStatus"] = envelope.fields.syncStatus as CKRecordValue
	return record
}

func privateDatabase(containerId: String) -> CKDatabase {
	CKContainer(identifier: containerId).privateCloudDatabase
}

func perform(operation: CKDatabaseOperation, in database: CKDatabase) async throws {
	try await withCheckedThrowingContinuation { continuation in
		if let operation = operation as? CKModifyRecordZonesOperation {
			operation.modifyRecordZonesResultBlock = { result in
				switch result {
				case .success:
					continuation.resume()
				case .failure(let error):
					continuation.resume(throwing: error)
				}
			}
		} else if let operation = operation as? CKFetchRecordZoneChangesOperation {
			operation.fetchRecordZoneChangesResultBlock = { result in
				switch result {
				case .success:
					continuation.resume()
				case .failure(let error):
					continuation.resume(throwing: error)
				}
			}
		} else if let operation = operation as? CKModifyRecordsOperation {
			operation.modifyRecordsResultBlock = { result in
				switch result {
				case .success:
					continuation.resume()
				case .failure(let error):
					continuation.resume(throwing: error)
				}
			}
		} else {
			continuation.resume(throwing: BridgeError.unsupportedOperation)
			return
		}

		database.add(operation)
	}
}

func decodeSyncState(from json: String?) throws -> SyncStateEnvelope {
	guard let json else {
		return SyncStateEnvelope(
			version: 1,
			databaseChangeToken: nil,
			zoneChangeTokens: [:],
			lastSyncAt: nil,
			lastFullSyncAt: nil
		)
	}

	return try bridgeDecoder.decode(SyncStateEnvelope.self, from: Data(json.utf8))
}

func decodePushPlan(from json: String?) throws -> PushPlanEnvelope {
	guard let json else {
		throw BridgeError.invalidPayload("Missing planJson")
	}

	return try bridgeDecoder.decode(PushPlanEnvelope.self, from: Data(json.utf8))
}

func encodeJson<T: Encodable>(_ value: T) -> String {
	let data = try! bridgeEncoder.encode(value)
	return String(decoding: data, as: UTF8.self)
}

func encodeServerChangeToken(_ token: CKServerChangeToken?) -> String? {
	guard let token else {
		return nil
	}
	let data = try? NSKeyedArchiver.archivedData(withRootObject: token, requiringSecureCoding: true)
	return data?.base64EncodedString()
}

func decodeServerChangeToken(_ value: String?) -> CKServerChangeToken? {
	guard let value, let data = Data(base64Encoded: value) else {
		return nil
	}
	return try? NSKeyedUnarchiver.unarchivedObject(ofClass: CKServerChangeToken.self, from: data)
}

func stringField(_ record: CKRecord, _ key: String) -> String {
	record[key] as? String ?? ""
}

func optionalStringField(_ record: CKRecord, _ key: String) -> String? {
	record[key] as? String
}

func encode(status: CKAccountStatus) -> String {
	switch status {
	case .available:
		return "available"
	case .couldNotDetermine:
		return "couldNotDetermine"
	case .noAccount:
		return "noAccount"
	case .restricted:
		return "restricted"
	case .temporarilyUnavailable:
		return "temporarilyUnavailable"
	@unknown default:
		return "unknown"
	}
}

enum BridgeError: LocalizedError {
	case invalidPayload(String)
	case unsupportedOperation

	var errorDescription: String? {
		switch self {
		case .invalidPayload(let message):
			return message
		case .unsupportedOperation:
			return "Unsupported CloudKit operation"
		}
	}
}
