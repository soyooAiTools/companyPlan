import crypto from "node:crypto";
import { soyooClient, soyooId } from "./soyoo-client.mjs";
import { getUser } from "./ops-realtime.mjs";
import { loadPlayableFeedbackSource } from "./playable-feedback-source.mjs";

const activeStatuses = new Set(["排队中", "进行中"]);
const nowIso = () => new Date().toISOString();

function completionError(message, status = 409) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function eventId(batchId, feedbackId) {
  return `ops-feedback_${crypto.createHash("sha256").update(`${batchId}:${feedbackId}`).digest("hex")}`;
}

function revisionForRows(rows) {
  const value = [...rows]
    .sort((left, right) => String(left.source_feedback_id).localeCompare(String(right.source_feedback_id)))
    .map((item) => [String(item.source_feedback_id), !!item.completed, String(item.last_batch_id || ""), String(item.updated_at || "")]);
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function completionState(source, rows) {
  return {
    source,
    revision: revisionForRows(rows),
    items: rows.map((item) => ({
      feedbackId: item.source_feedback_id,
      displayOrder: Number(item.display_order),
      feedbackText: item.feedback_text || "",
      completed: !!item.completed,
      completedAt: item.completed_at || null,
    })),
  };
}

async function readItems(database, ticketId, lock = false) {
  return database.$queryRawUnsafe(
    `SELECT * FROM ops_ticket_playable_feedback_items WHERE ticket_id = ? ORDER BY display_order ASC${lock ? " FOR UPDATE" : ""}`,
    String(ticketId),
  );
}

// New tickets are initialized at creation time. Active historical tickets are
// backfilled only when opened, using the authoritative assignment mapping.
export async function ensurePlayableFeedbackItems(database, ticket, { loadAssignment = soyooClient.playableFeedbackAssignment } = {}) {
  const source = await loadPlayableFeedbackSource(database, String(ticket?.id || ""));
  if (!source?.reviewId) return null;
  let items = await readItems(database, ticket.id);
  if (!items.length && activeStatuses.has(String(ticket.status || ""))) {
    const payload = await loadAssignment(source.assignmentId);
    const feedbacks = Array.isArray(payload?.feedbacks) ? payload.feedbacks : [];
    for (const [index, feedback] of feedbacks.entries()) {
      const feedbackId = String(feedback?.feedbackId || "").trim();
      if (!feedbackId) continue;
      await database.$executeRawUnsafe(
        `INSERT IGNORE INTO ops_ticket_playable_feedback_items
         (ticket_id, source_review_id, source_assignment_id, source_feedback_id, display_order, feedback_text, completed, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        String(ticket.id), source.reviewId, source.assignmentId, feedbackId,
        Number(feedback?.displayOrder) || index + 1, String(feedback?.feedbackText || "").slice(0, 500), nowIso(),
      );
    }
    items = await readItems(database, ticket.id);
  }
  return completionState(source, items);
}

// Snapshot the operator from server-owned profile data before the durable OPS
// transaction. Delivery may happen much later, after the user changed profile.
export async function resolvePlayableFeedbackActorSnapshot(database, user, { loadUser = getUser } = {}) {
  const actorId = String(user?.id || "").trim();
  if (!actorId) throw completionError("无法识别当前操作人，请重新登录", 401);
  const ids = [...new Set([actorId, soyooId(actorId)].filter(Boolean))];
  const local = await database.people?.findFirst?.({
    where: { id: { in: ids } },
    select: { wechat_name: true, wechat_avatar: true },
  }).catch(() => null);
  let actorName = String(local?.wechat_name || "").trim();
  let actorAvatar = String(local?.wechat_avatar || "").trim();
  if (!actorName || !actorAvatar) {
    const fresh = await loadUser(actorId).catch(() => null);
    actorName ||= String(fresh?.wechatName || "").trim();
    actorAvatar ||= String(fresh?.avatar || "").trim();
  }
  if (!actorName || !actorAvatar) {
    throw completionError("当前账号缺少微信名称或头像，请先完善个人资料后再确认反馈完成标记", 409);
  }
  return { actorId, actorName: actorName.slice(0, 191), actorAvatar: actorAvatar.slice(0, 1024) };
}

export async function savePlayableFeedbackCompletion(database, {
  ticket,
  user,
  actorSnapshot,
  completedFeedbackIds,
  expectedRevision,
  requestId,
}) {
  const initial = await ensurePlayableFeedbackItems(database, ticket);
  if (!initial) return null;
  const snapshot = actorSnapshot || await resolvePlayableFeedbackActorSnapshot(database, user);
  const batchId = String(requestId || "").trim() || crypto.randomUUID();
  const desired = new Set((Array.isArray(completedFeedbackIds) ? completedFeedbackIds : []).map(String));

  return database.$transaction(async (tx) => {
    // Every writer takes locks in ticket -> feedback order. This makes a ticket
    // completion and a concurrent cancellation mutually exclusive.
    const lockedTickets = await tx.$queryRawUnsafe("SELECT * FROM tickets WHERE id = ? FOR UPDATE", String(ticket.id));
    const lockedTicket = lockedTickets[0];
    if (!lockedTicket) throw completionError("提单不存在", 404);

    const duplicate = await tx.$queryRawUnsafe("SELECT id FROM ops_ticket_playable_feedback_batches WHERE id = ? LIMIT 1", batchId);
    const rows = await readItems(tx, ticket.id, true);
    if (duplicate.length) return { ...completionState(initial.source, rows), changes: [], idempotent: true };
    if (lockedTicket.status === "已完成") throw completionError("已完成工单请先重新打开后再修改反馈完成标记");
    if (!rows.length) throw completionError("该反馈工单尚未加载反馈列表，请刷新后重试");

    const currentRevision = revisionForRows(rows);
    if (!expectedRevision || String(expectedRevision) !== currentRevision) {
      throw completionError("反馈完成状态已被其他人更新，请刷新工单后重试");
    }
    const expectedIds = new Set(rows.map((item) => String(item.source_feedback_id)));
    if ([...desired].some((feedbackId) => !expectedIds.has(feedbackId))) {
      throw completionError("反馈列表已更新，请刷新工单后重试");
    }

    const changes = rows
      .map((item) => ({ item, completed: desired.has(String(item.source_feedback_id)) }))
      .filter(({ item, completed }) => !!item.completed !== completed);
    if (!changes.length) return { ...completionState(initial.source, rows), changes: [], idempotent: false };

    const occurredAt = nowIso();
    for (const { item, completed } of changes) {
      await tx.$executeRawUnsafe(
        `UPDATE ops_ticket_playable_feedback_items
         SET completed = ?, last_batch_id = ?, completed_by_user_id = ?, completed_at = ?, updated_at = ?
         WHERE ticket_id = ? AND source_feedback_id = ?`,
        completed ? 1 : 0, batchId, snapshot.actorId, completed ? occurredAt : null, occurredAt,
        String(ticket.id), item.source_feedback_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO ops_ticket_playable_feedback_outbox
         (id, batch_id, ticket_id, source_review_id, source_assignment_id, source_feedback_id, completed,
          actor_id, actor_name, actor_avatar, occurred_at, attempts, status, next_attempt_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', ?, ?)`,
        eventId(batchId, item.source_feedback_id), batchId, String(ticket.id), item.source_review_id,
        item.source_assignment_id, item.source_feedback_id, completed ? 1 : 0,
        snapshot.actorId, snapshot.actorName, snapshot.actorAvatar, occurredAt, occurredAt, occurredAt,
      );
    }

    const completed = changes.filter((change) => change.completed).map(({ item }) => ({
      feedbackId: item.source_feedback_id, displayOrder: Number(item.display_order),
    }));
    const canceled = changes.filter((change) => !change.completed).map(({ item }) => ({
      feedbackId: item.source_feedback_id, displayOrder: Number(item.display_order),
    }));
    const note = [
      completed.length ? `标记反馈完成：${completed.map((item) => `#${item.displayOrder}`).join("、")}` : "",
      canceled.length ? `取消反馈完成：${canceled.map((item) => `#${item.displayOrder}`).join("、")}` : "",
    ].filter(Boolean).join("；");
    await tx.$executeRawUnsafe(
      `INSERT INTO ops_ticket_playable_feedback_batches
       (id, ticket_id, actor_id, actor_name, actor_avatar, changes_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      batchId, String(ticket.id), snapshot.actorId, snapshot.actorName, snapshot.actorAvatar,
      JSON.stringify({ completed, canceled }), occurredAt,
    );
    await tx.ticket_events.create({ data: {
      ticket_id: String(ticket.id), actor_id: snapshot.actorId, actor_name: snapshot.actorName,
      action: "反馈完成标记", from_status: null, to_status: null, note, created_at: occurredAt,
    } });

    const finalRows = await readItems(tx, ticket.id, false);
    return {
      ...completionState(initial.source, finalRows),
      changes: changes.map(({ item, completed: value }) => ({ feedbackId: item.source_feedback_id, completed: value })),
      idempotent: false,
    };
  });
}

export function assertPlayableFeedbackRowsComplete(rows) {
  if (!rows.length) throw completionError("该反馈工单尚未加载反馈列表，请打开工单详情后再完成");
  const pending = rows.filter((item) => !item.completed).length;
  if (pending) throw completionError(`该工单还有下还有 ${pending} 条反馈未标记完成`);
}

export async function updateTicketStatusWithFeedbackGate(database, {
  ticketId,
  status,
  gateFeedback = false,
  data,
  eventData,
}) {
  return database.$transaction(async (tx) => {
    // Keep this lock order identical to checklist writes: ticket first, then
    // feedback rows. Whichever transaction wins determines the other result.
    const rows = await tx.$queryRawUnsafe("SELECT * FROM tickets WHERE id = ? FOR UPDATE", String(ticketId));
    const current = rows[0];
    if (!current) throw completionError("提单不存在", 404);
    if (current.status === status) return { previous: current, updated: current, changed: false };
    if (status === "已完成" && gateFeedback) {
      const feedbackRows = await readItems(tx, ticketId, true);
      assertPlayableFeedbackRowsComplete(feedbackRows);
    }
    const updated = await tx.tickets.update({ where: { id: String(ticketId) }, data });
    const resolvedEventData = typeof eventData === "function" ? eventData(current) : eventData;
    await tx.ticket_events.create({ data: { ...resolvedEventData, from_status: current.status, to_status: status } });
    return { previous: current, updated, changed: true };
  });
}

export async function assertPlayableFeedbackTicketCompletion(ticket, { database } = {}) {
  const state = await ensurePlayableFeedbackItems(database, ticket);
  if (!state) return null;
  assertPlayableFeedbackRowsComplete(state.items);
  return state;
}
