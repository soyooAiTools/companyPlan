import crypto from "node:crypto";
import { prisma } from "./prisma.mjs";
import { getResponsibles, getUser } from "./ops-realtime.mjs";
import { loadSegments, prepareTicketCreate } from "./ops-routes.mjs";
import { nowIso } from "./ops-helpers.mjs";
import * as notif from "./services/ops-notifications.mjs";
import { refreshProjectPoolSnapshot } from "./services/ops-project-pool.mjs";

const SOURCE_SYSTEM = "playable-feedback";
const PRIORITIES = new Set(["紧急", "优先", "普通", "低优先"]);

function tagName(tag) {
  return typeof tag === "string" ? tag.trim() : String(tag?.name || tag?.Name || "").trim();
}

export function isFeedbackAssignmentRequester(user) {
  return !!user && (user.isAdmin || (user.tags || []).some((tag) => tagName(tag) === "制片"));
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sourcePayloadHash(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function clip(value, max) {
  return String(value ?? "").slice(0, max);
}

function versionProjectRef(projectId, versionId) {
  const base = String(projectId || "").split("::version-")[0];
  return versionId ? `${base}::version-${versionId}` : base;
}

function validateBatchBody(body) {
  const projectId = clip(body?.projectId, 64).trim();
  const requesterUserId = clip(body?.requesterUserId, 64).trim();
  const batchId = clip(body?.source?.batchId, 64).trim();
  const reviewId = clip(body?.source?.reviewId, 64).trim();
  const feedbackId = clip(body?.source?.feedbackId, 160).trim();
  const tickets = Array.isArray(body?.tickets) ? body.tickets : [];
  if (!projectId || !requesterUserId || !batchId || !reviewId || !feedbackId) return "缺少项目、发起人或反馈来源信息";
  if (!tickets.length || tickets.length > 20) return "每个指派批次须包含 1 至 20 位负责人";
  const keys = tickets.map((item) => clip(item?.sourceAssignmentId, 64).trim());
  if (keys.some((key) => !key)) return "缺少指派幂等标识";
  if (new Set(keys).size !== keys.length) return "同一批次存在重复指派";
  return "";
}

async function findSourceLinks(assignmentIds, database = prisma) {
  if (!assignmentIds.length) return [];
  return database.ops_ticket_source_links.findMany({
    where: { source_system: SOURCE_SYSTEM, source_assignment_id: { in: assignmentIds } },
  });
}

async function loadTicketMappings(assignmentIds, database = prisma) {
  if (!assignmentIds.length) return [];
  const links = await findSourceLinks(assignmentIds, database);
  if (!links.length) return [];
  const tickets = await database.tickets.findMany({
    where: { id: { in: links.map((item) => item.ticket_id) } },
    select: { id: true, owner_id: true, status: true, updated_at: true, status_updated_at: true },
  });
  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  return links.map((link) => {
    const ticket = ticketById.get(link.ticket_id);
    return {
      assignmentId: link.source_assignment_id,
      ticketId: link.ticket_id,
      ownerId: ticket?.owner_id || "",
      status: ticket?.status || "未知",
      statusUpdatedAt: ticket?.status_updated_at || ticket?.updated_at || null,
      sourceUrl: link.source_url || "",
    };
  });
}

export function registerPlayableFeedbackIntegrationRoutes(app, { requireServiceAuth, dependencies = {} }) {
  const base = "/api/internal/playable-feedback";
  const database = dependencies.prisma || prisma;
  const getResponsiblesForProject = dependencies.getResponsibles || getResponsibles;
  const getRequester = dependencies.getUser || getUser;
  const loadTicketSegments = dependencies.loadSegments || loadSegments;
  const prepareTicket = dependencies.prepareTicketCreate || prepareTicketCreate;
  const notifyTicketAssigned = dependencies.notifyTicketAssigned || notif.notifyTicketAssigned;
  const refreshProject = dependencies.refreshProjectPoolSnapshot || refreshProjectPoolSnapshot;

  app.get(`${base}/projects/:id/responsibles`, requireServiceAuth, async (request, response) => {
    const projectId = clip(request.params.id, 64).trim();
    const versionId = clip(request.query?.versionId, 64).trim();
    if (!projectId) return response.status(400).json({ error: "缺少项目" });
    try {
      const segments = await loadTicketSegments();
      const result = await getResponsiblesForProject(versionProjectRef(projectId, versionId), segments);
      return response.json({ projectId, versionId, ...result });
    } catch (error) {
      return response.status(error?.status || 502).json({ error: error?.soyooError || error?.message || "读取项目制作人员失败" });
    }
  });

  app.post(`${base}/tickets/status`, requireServiceAuth, async (request, response) => {
    const assignmentIds = [...new Set((request.body?.assignmentIds || []).map((id) => clip(id, 64).trim()).filter(Boolean))].slice(0, 100);
    if (!assignmentIds.length) return response.status(400).json({ error: "缺少指派编号" });
    return response.json({ assignments: await loadTicketMappings(assignmentIds, database) });
  });

  app.post(`${base}/tickets/batch`, requireServiceAuth, async (request, response) => {
    const body = request.body || {};
    const invalid = validateBatchBody(body);
    if (invalid) return response.status(400).json({ error: invalid });

    let requester;
    try {
      requester = await getRequester(body.requesterUserId);
    } catch (error) {
      return response.status(error?.status || 502).json({ error: error?.soyooError || error?.message || "校验指派发起人失败" });
    }
    if (!requester || requester.status === "disabled") return response.status(403).json({ error: "指派发起人不存在或已停用" });
    if (!isFeedbackAssignmentRequester(requester)) return response.status(403).json({ error: "只有制片或管理员可以从反馈创建工单" });

    const user = {
      id: requester.id,
      username: requester.username,
      name: requester.name,
      roleKey: requester.isAdmin ? "admin" : "member",
    };
    const projectId = clip(body.projectId, 64).trim();
    const projectVersionId = clip(body.projectVersionId, 64).trim();
    const source = {
      batchId: clip(body.source.batchId, 64).trim(),
      reviewId: clip(body.source.reviewId, 64).trim(),
      feedbackId: clip(body.source.feedbackId, 160).trim(),
      url: clip(body.source.url, 500).trim(),
    };
    const normalized = body.tickets.map((item) => ({
      sourceAssignmentId: clip(item.sourceAssignmentId, 64).trim(),
      ownerId: clip(item.ownerId, 64).trim(),
      segmentId: Number(item.segmentId),
      title: clip(item.title, 160).trim(),
      contentHtml: String(item.contentHtml || ""),
      summary: clip(item.summary, 2000),
      priority: PRIORITIES.has(item.priority) ? item.priority : "普通",
      needType: clip(item.needType, 120),
    }));

    const assignmentIds = normalized.map((item) => item.sourceAssignmentId);
    const existing = await findSourceLinks(assignmentIds, database);
    const existingById = new Map(existing.map((item) => [item.source_assignment_id, item]));
    const prepared = [];
    for (let index = 0; index < normalized.length; index += 1) {
      const item = normalized[index];
      if (!item.ownerId || !Number.isInteger(item.segmentId)) return response.status(400).json({ error: `工单 ${index + 1} 缺少负责人或环节` });
      const hash = sourcePayloadHash({ projectId, projectVersionId, source, ticket: item });
      const hit = existingById.get(item.sourceAssignmentId);
      if (hit) {
        if (hit.payload_sha256 !== hash) return response.status(409).json({ error: `指派 ${item.sourceAssignmentId} 的幂等内容不一致` });
        continue;
      }
      const result = await prepareTicket({
        user,
        body: {
          ...item,
          projectId,
          projectVersionId,
          projectVersionCode: clip(body.projectVersionCode, 40),
          projectVersionName: clip(body.projectVersionName, 160),
          hyperlink: source.url,
        },
      });
      if (result.soyooError) return response.status(result.soyooError?.status || 502).json({ error: result.soyooError?.soyooError || "校验负责人失败" });
      if (result.error) return response.status(result.status || 400).json({ error: `工单 ${index + 1}：${result.error}` });
      prepared.push({ item, hash, result });
    }

    try {
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
              note: `来源反馈 ${source.reviewId}/${source.feedbackId}`.slice(0, 500),
              created_at: nowIso(),
            },
          });
          await tx.ops_ticket_source_links.create({
            data: {
              source_system: SOURCE_SYSTEM,
              source_batch_id: source.batchId,
              source_assignment_id: entry.item.sourceAssignmentId,
              source_review_id: source.reviewId,
              source_feedback_id: source.feedbackId,
              ticket_id: ticket.id,
              payload_sha256: entry.hash,
              source_url: source.url || null,
              created_at: nowIso(),
            },
          });
          rows.push(ticket);
        }
        return rows;
      });
      for (const ticket of created) await notifyTicketAssigned(ticket, requester.id);
      if (created.length) await refreshProject(projectId).catch(() => null);
    } catch (error) {
      // 并发重试可能在唯一键处相撞。若全部来源映射已存在，就按幂等成功返回。
      const links = await findSourceLinks(assignmentIds, database);
      const byId = new Map(links.map((item) => [item.source_assignment_id, item]));
      const allMatch = normalized.every((item) => {
        const link = byId.get(item.sourceAssignmentId);
        return link && link.payload_sha256 === sourcePayloadHash({ projectId, projectVersionId, source, ticket: item });
      });
      if (!allMatch) throw error;
    }

    const assignments = await loadTicketMappings(assignmentIds, database);
    const byAssignment = new Map(assignments.map((item) => [item.assignmentId, item]));
    return response.status(prepared.length ? 201 : 200).json({
      assignments: assignmentIds.map((id) => byAssignment.get(id)).filter(Boolean),
      idempotent: prepared.length === 0,
    });
  });
}
