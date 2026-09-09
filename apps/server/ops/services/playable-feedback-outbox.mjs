import crypto from "node:crypto";
import { prisma } from "../prisma.mjs";
import { getFeedbackResponsibles, getUser } from "../ops-realtime.mjs";
import { loadSegments, prepareTicketCreate } from "../ops-routes.mjs";
import { nowIso } from "../ops-helpers.mjs";
import * as notifications from "./ops-notifications.mjs";
import { refreshProjectPoolSnapshot } from "./ops-project-pool.mjs";
import { buildPlayableFeedbackSourceUrl } from "../playable-feedback-source.mjs";

const SOURCE_SYSTEM = "playable-feedback";

function stableStringify(value) {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function payloadHash(value) {
	return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function projectRef(projectId, versionId) {
	return versionId ? `${projectId}::version-${versionId}` : projectId;
}

export async function consumePlayableFeedbackBatch(payload, dependencies = {}) {
	const database = dependencies.prisma || prisma;
	const source = payload?.source || {};
	const projectId = String(payload?.projectId || "").trim();
	const projectVersionId = String(payload?.projectVersionId || "").trim();
	const requesterUserId = String(payload?.requesterUserId || "").trim();
	const tickets = Array.isArray(payload?.tickets) ? payload.tickets : [];
	if (!projectId || !requesterUserId || !source.batchId || !source.reviewId || !source.feedbackId || !tickets.length) {
		throw new Error("录制反馈提单数据不完整");
	}

	const requester = await (dependencies.getUser || getUser)(requesterUserId);
	if (!requester || requester.status === "disabled") throw new Error("录制反馈提单人不存在或已停用");

	const loadTicketSegments = dependencies.loadSegments || loadSegments;
	const segments = await loadTicketSegments();
	const options = await (dependencies.getFeedbackResponsibles || getFeedbackResponsibles)(projectRef(projectId, projectVersionId), segments);
	const memberById = new Map((options.members || []).map((member) => [String(member.id), member]));
	const segmentById = new Map((options.segments || []).map((segment) => [Number(segment.id), segment]));
	const prepare = dependencies.prepareTicketCreate || prepareTicketCreate;
	const sourceUrl = buildPlayableFeedbackSourceUrl(source.url, source.reviewId, "");

	const prepared = [];
	for (const ticket of tickets) {
		const assignmentId = String(ticket.sourceAssignmentId || "").trim();
		const ownerId = String(ticket.ownerId || "").trim();
		const member = memberById.get(ownerId);
		if (!assignmentId || !member) throw new Error("录制反馈负责人不属于当前项目版本");
		const requestedSegmentId = Number(ticket.segmentId);
		const segmentId = requestedSegmentId > 0 && segmentById.has(requestedSegmentId) ? requestedSegmentId : Number(member.segmentIds?.[0]);
		if (!Number.isInteger(segmentId) || !segmentById.has(segmentId)) {
			throw new Error(`负责人 ${member.name || member.username || ownerId} 未匹配到制作环节`);
		}
		const link = await database.ops_ticket_source_links.findFirst({
			where: { source_system: SOURCE_SYSTEM, source_assignment_id: assignmentId },
		});
		const hash = payloadHash({ projectId, projectVersionId, source, ticket: { ...ticket, segmentId } });
		if (link) {
			if (link.payload_sha256 !== hash) throw new Error(`反馈指派 ${assignmentId} 的幂等内容不一致`);
			continue;
		}
		const result = await prepare({
			user: { id: requester.id, username: requester.username, name: requester.name, roleKey: requester.isAdmin ? "admin" : "member" },
			feedbackAssignment: true,
			database,
			body: {
				...ticket,
				projectId,
				projectVersionId,
				projectVersionCode: payload.projectVersionCode || "",
				projectVersionName: payload.projectVersionName || "",
				ownerId,
				segmentId,
				hyperlink: buildPlayableFeedbackSourceUrl(source.url, source.reviewId, assignmentId),
			},
		});
		if (result.soyooError) throw result.soyooError;
		if (result.error) throw new Error(result.error);
		prepared.push({ assignmentId, hash, result });
	}

	const created = await database.$transaction(async (tx) => {
		const rows = [];
		for (const entry of prepared) {
			const ticket = await tx.tickets.create({ data: entry.result.data });
			await tx.ticket_events.create({
				data: {
					ticket_id: ticket.id,
					actor_id: requester.id,
					actor_name: requester.name || requester.username || "",
					action: "反馈指派建单",
					from_status: null,
					to_status: "排队中",
					note: "由录制反馈发布，点击来源可返回对应历史版本和反馈帧。",
					created_at: nowIso(),
				},
			});
			await tx.ops_ticket_source_links.create({
				data: {
					source_system: SOURCE_SYSTEM,
					source_batch_id: String(source.batchId),
					source_assignment_id: entry.assignmentId,
					source_review_id: String(source.reviewId),
					source_feedback_id: String(source.feedbackId),
					ticket_id: ticket.id,
					payload_sha256: entry.hash,
					source_url: sourceUrl || null,
					created_at: nowIso(),
				},
			});
			rows.push(ticket);
		}
		return rows;
	});

	for (const ticket of created) await (dependencies.notifyTicketAssigned || notifications.notifyTicketAssigned)(ticket, requester.id);
	if (created.length) await (dependencies.refreshProjectPoolSnapshot || refreshProjectPoolSnapshot)(projectId).catch(() => null);
	return { created: created.length, idempotent: prepared.length === 0 };
}
