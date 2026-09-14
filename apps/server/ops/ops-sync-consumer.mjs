// 消费 soyoo 变更 outbox:按游标拉 /integration/changes,刷新工单快照(改名/换头像等"改信息")。
// 不丢:ops 挂了 outbox 堆着,起来从 last_seq 续传;幂等:重复处理就是再 UPDATE 成同值。
import { prisma } from "./prisma.mjs";
import { soyooClient } from "./soyoo-client.mjs";
import { getProjectWithMembers, getUser } from "./ops-realtime.mjs";
import { autoCreateProgramFirstTicket, refreshProjectPoolSnapshot, refreshProjectPoolSnapshotsByMember } from "./services/ops-project-pool.mjs";
import { consumePlayableFeedbackBatch } from "./services/playable-feedback-outbox.mjs";

const DEFAULT_MAX_CHANGE_ATTEMPTS = 5;

async function getLastSeq() {
  const row = await prisma.ops_sync_state.findUnique({ where: { k: "last_seq" } });
  return row ? Number(row.v) : 0;
}
async function setLastSeq(seq) {
  await prisma.ops_sync_state.upsert({
    where: { k: "last_seq" },
    create: { k: "last_seq", v: BigInt(seq) },
    update: { v: BigInt(seq) },
  });
}

function syncFailureLimit() {
  const configured = Number(process.env.COMPANYPLAN_OPS_CHANGE_MAX_ATTEMPTS ?? DEFAULT_MAX_CHANGE_ATTEMPTS);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_CHANGE_ATTEMPTS;
}

function isPermanentChangeError(error) {
  if (Number(error?.status) >= 400 && Number(error?.status) < 500) return true;
  const message = String(error?.message || error || "");
  return [
    "不存在或已停用",
    "不属于当前项目版本",
    "未匹配到制作环节",
    "幂等内容不一致",
    "提单数据不完整",
  ].some((text) => message.includes(text));
}

async function recordSyncFailure(change, error, skipped) {
  const now = new Date().toISOString();
  const message = String(error?.message || error || "未知错误").slice(0, 2000);
  await prisma.$executeRawUnsafe(
    `INSERT INTO ops_sync_dead_letters (
      seq, entity_type, entity_id, action, attempts, last_error, first_failed_at, last_failed_at, skipped_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      attempts = attempts + 1,
      last_error = VALUES(last_error),
      last_failed_at = VALUES(last_failed_at),
      skipped_at = VALUES(skipped_at)`,
    BigInt(change.seq),
    String(change.entity_type || ""),
    String(change.entity_id || ""),
    String(change.action || "").slice(0, 255),
    message,
    now,
    now,
    skipped ? now : null,
  );
  const rows = await prisma.$queryRawUnsafe("SELECT attempts FROM ops_sync_dead_letters WHERE seq = ? LIMIT 1", BigInt(change.seq));
  return Number(rows?.[0]?.attempts || 1);
}

async function clearSyncFailure(seq) {
  await prisma.$executeRawUnsafe("DELETE FROM ops_sync_dead_letters WHERE seq = ?", BigInt(seq));
}

function userIdCandidates(userId) {
  const id = String(userId);
  return id.startsWith("ops-user-") ? [id, id.replace(/^ops-user-/, "")] : [id, `ops-user-${id}`];
}

function programFirstTicketRequest(action) {
  const match = String(action || "").match(/^program_first_ticket:(\d+)(?::(\d+))?$/);
  return match ? { ownerId: match[1], versionId: match[2] || "" } : null;
}

function playableFeedbackRequest(action) {
  const match = String(action || "").match(/^playable_feedback:(assign_batch_[a-f0-9]+)$/);
  return match ? { batchId: match[1] } : null;
}

// 用户改名/换头像/管理员/禁用状态 → 同步本地身份 + 刷该用户在所有工单里的 owner/requester 快照
async function refreshUser(userId) {
  const ids = userIdCandidates(userId);
  let u;
  try {
    u = await getUser(userId);
  } catch (error) {
    // 用户已从 soyoo 删除时，仍要消费这条变更，避免旧用户阻塞整个 outbox 游标。
    if (Number(error?.status) !== 404) throw error;
    await prisma.people.updateMany({ where: { id: { in: ids } }, data: { disabled_at: new Date().toISOString() } });
    return;
  }
  if (!u) {
    await prisma.people.updateMany({ where: { id: { in: ids } }, data: { disabled_at: new Date().toISOString() } });
    return;
  }
  await prisma.people.updateMany({
    where: { id: { in: ids } },
    data: {
      name: u.name,
      wechat_name: u.wechatName,
      wechat_avatar: u.avatar,
      hire_date: u.hireDate || null,
      rating: u.rating || "",
      role_key: u.isAdmin ? "admin" : "member",
      disabled_at: u.status === "disabled" ? new Date().toISOString() : null,
    },
  });
  await prisma.tickets.updateMany({ where: { owner_id: u.id }, data: { owner_name: u.name, owner_avatar: u.avatar, owner_username: u.username } });
  await prisma.tickets.updateMany({ where: { requester_id: u.id }, data: { requester_name: u.name, requester_avatar: u.avatar, requester_username: u.username } });
  await refreshProjectPoolSnapshotsByMember(u.id);
}
// 项目改名/改状态 → 刷该项目所有工单的 项目/客户 快照
async function refreshProject(projectId) {
  let p;
  try {
    p = await soyooClient.project(projectId);
  } catch (error) {
    // Soyoo 删除项目后详情接口返回 404；仍须刷新项目池快照，清除遗留行。
    if (Number(error?.status) === 404) {
      await refreshProjectPoolSnapshot(projectId);
      return;
    }
    throw error;
  }
  if (!p) return;
  await prisma.tickets.updateMany({
    where: { project_id: String(p.id) },
    data: {
      project_name: p.name ?? "",
      project_status: p.status ?? "",
      client_id: String(p.tenant_id ?? ""),
      client_name: p.tenant_name ?? "",
      source_project_name: p.tenant_name ?? "",
    },
  });
  await refreshProjectPoolSnapshot(projectId);
}

async function handleProjectChange(ch, logger) {
  const projectId = String(ch.entity_id);
  const feedbackRequest = playableFeedbackRequest(ch.action);
  if (feedbackRequest) {
    const payload = await soyooClient.playableFeedbackBatch(feedbackRequest.batchId);
    const result = await consumePlayableFeedbackBatch(payload);
    if (result.conflicts?.length) {
      logger?.warn?.("[ops-outbox] playable feedback idempotency conflict skipped", { projectId, batchId: feedbackRequest.batchId, assignmentIds: result.conflicts });
    }
    logger?.info?.("[ops-outbox] create playable feedback tickets", { projectId, batchId: feedbackRequest.batchId, ...result });
    return;
  }
  const programRequest = programFirstTicketRequest(ch.action);
  if (programRequest) {
    const projectRef = programRequest.versionId ? `${projectId}::version-${programRequest.versionId}` : projectId;
    const { project, members } = await getProjectWithMembers(projectRef);
    if (!project) return;
    const result = await autoCreateProgramFirstTicket({
      requesterUserId: String(ch.requester_user_id || ""),
      project,
      members,
      projectId,
      versionId: programRequest.versionId,
      ownerUserId: programRequest.ownerId,
      eventNote: "项目分配程序后自动生成",
    });
    logger?.info?.("[ops-outbox] auto create program ticket", { projectId, versionId: programRequest.versionId, requesterUserId: ch.requester_user_id, ...result });
    await refreshProjectPoolSnapshot(projectId);
    return;
  }
  await refreshProject(projectId);
}
// 客户改名 → 刷该客户所有工单的 客户名 快照
async function refreshTenant(tenantId) {
  const tenants = await soyooClient.tenants();
  const t = (Array.isArray(tenants) ? tenants : []).find((x) => String(x.id) === String(tenantId));
  if (!t) return;
  await prisma.tickets.updateMany({ where: { client_id: String(tenantId) }, data: { client_name: t.name ?? "", source_project_name: t.name ?? "" } });
}

let running = false;

// A previous OPS version may advance the shared project-change cursor before
// it knows how to consume playable feedback actions. Replaying a small recent
// window on startup is safe because ticket creation is idempotent by assignment.
async function replayRecentPlayableFeedback(logger) {
  const lastSeq = await getLastSeq();
  if (!lastSeq) return;
  const changes = await soyooClient.changes(Math.max(0, lastSeq - 500), 500);
  for (const change of Array.isArray(changes) ? changes : []) {
    if (Number(change.seq) > lastSeq || change.entity_type !== "project") continue;
    const request = playableFeedbackRequest(change.action);
    if (!request) continue;
    try {
      const payload = await soyooClient.playableFeedbackBatch(request.batchId);
      const result = await consumePlayableFeedbackBatch(payload);
      if (result.conflicts?.length) {
        logger?.warn?.("[ops-outbox] playable feedback idempotency conflict skipped", { batchId: request.batchId, assignmentIds: result.conflicts });
      }
      logger?.info?.("[ops-outbox] reconcile playable feedback tickets", { batchId: request.batchId, ...result });
    } catch (error) {
      logger?.warn?.("[ops-outbox] reconcile playable feedback failed", { batchId: request.batchId, error: error?.message ?? String(error) });
    }
  }
}

async function poll(logger) {
  if (running) return;
  running = true;
  try {
    let after = await getLastSeq();
    for (let round = 0; round < 20; round++) {
      const changes = await soyooClient.changes(after, 200);
      if (!Array.isArray(changes) || !changes.length) break;
      for (const ch of changes) {
        let deadLettered = false;
        try {
          if (ch.entity_type === "user") await refreshUser(String(ch.entity_id));
          else if (ch.entity_type === "project") await handleProjectChange(ch, logger);
          else if (ch.entity_type === "tenant") await refreshTenant(String(ch.entity_id));
        } catch (e) {
          const permanent = isPermanentChangeError(e);
          const attempts = await recordSyncFailure(ch, e, permanent);
          const skipped = permanent || attempts >= syncFailureLimit();
          logger?.warn?.(skipped ? "[ops-outbox] change moved to dead letter" : "[ops-outbox] apply change failed", {
            seq: ch.seq,
            type: ch.entity_type,
            attempts,
            error: e?.message ?? String(e),
          });
          if (!skipped) throw e;
          deadLettered = true;
        }
        after = Number(ch.seq);
        await setLastSeq(after);
        if (!deadLettered) await clearSyncFailure(ch.seq);
      }
      if (changes.length < 200) break;
    }
  } catch (e) {
    logger?.warn?.("[ops-outbox] poll failed", { error: e?.message ?? String(e) });
  } finally {
    running = false;
  }
}

// 启动消费者:定时拉 + 启动先拉一次。间隔可配 COMPANYPLAN_OPS_PULL_INTERVAL_MS(默认 30s)。
export function startOpsChangeConsumer({ logger } = {}) {
  if (process.env.COMPANYPLAN_OPS_CHANGE_CONSUMER_ENABLED === "0") {
    logger?.info?.("[ops-outbox] change consumer disabled");
    return null;
  }
  const intervalMs = Number(process.env.COMPANYPLAN_OPS_PULL_INTERVAL_MS ?? "30000");
  const timer = setInterval(() => void poll(logger), intervalMs);
	void replayRecentPlayableFeedback(logger).finally(() => poll(logger));
  logger?.info?.("[ops-outbox] change consumer started", { intervalMs });
  return timer;
}
