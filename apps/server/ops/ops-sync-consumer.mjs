// 消费 soyoo 变更 outbox:按游标拉 /integration/changes,刷新工单快照(改名/换头像等"改信息")。
// 不丢:ops 挂了 outbox 堆着,起来从 last_seq 续传;幂等:重复处理就是再 UPDATE 成同值。
import { prisma } from "./prisma.mjs";
import { soyooClient } from "./soyoo-client.mjs";
import { getProjectWithMembers, getUser } from "./ops-realtime.mjs";
import { autoCreateProgramFirstTicket, refreshProjectPoolSnapshot, refreshProjectPoolSnapshotsByMember } from "./services/ops-project-pool.mjs";

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

function userIdCandidates(userId) {
  const id = String(userId);
  return id.startsWith("ops-user-") ? [id, id.replace(/^ops-user-/, "")] : [id, `ops-user-${id}`];
}

function programFirstTicketOwnerId(action) {
  const match = String(action || "").match(/^program_first_ticket:(\d+)$/);
  return match ? match[1] : "";
}

// 用户改名/换头像/管理员/禁用状态 → 同步本地身份 + 刷该用户在所有工单里的 owner/requester 快照
async function refreshUser(userId) {
  const u = await getUser(userId);
  const ids = userIdCandidates(userId);
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
  const programOwnerId = programFirstTicketOwnerId(ch.action);
  if (ch.action === "create_project" || programOwnerId) {
    const { project, members } = await getProjectWithMembers(projectId);
    if (!project) return;
    const result = await autoCreateProgramFirstTicket({
      requesterUserId: String(ch.requester_user_id || ""),
      project,
      members,
      projectId,
      ownerUserId: programOwnerId,
      eventNote: ch.action === "create_project" ? "项目立项后自动生成" : "项目分配程序后自动生成",
    });
    logger?.info?.("[ops-outbox] auto create program ticket", { projectId, requesterUserId: ch.requester_user_id, ...result });
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
async function poll(logger) {
  if (running) return;
  running = true;
  try {
    let after = await getLastSeq();
    for (let round = 0; round < 20; round++) {
      const changes = await soyooClient.changes(after, 200);
      if (!Array.isArray(changes) || !changes.length) break;
      for (const ch of changes) {
        try {
          if (ch.entity_type === "user") await refreshUser(String(ch.entity_id));
          else if (ch.entity_type === "project") await handleProjectChange(ch, logger);
          else if (ch.entity_type === "tenant") await refreshTenant(String(ch.entity_id));
        } catch (e) {
          logger?.warn?.("[ops-outbox] apply change failed", { seq: ch.seq, type: ch.entity_type, error: e?.message ?? String(e) });
        }
        after = Number(ch.seq);
        await setLastSeq(after);
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
  const intervalMs = Number(process.env.COMPANYPLAN_OPS_PULL_INTERVAL_MS ?? "30000");
  setInterval(() => void poll(logger), intervalMs);
  void poll(logger);
  logger?.info?.("[ops-outbox] change consumer started", { intervalMs });
}
