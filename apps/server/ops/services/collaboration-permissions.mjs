import { prisma } from "../prisma.mjs";
import { isAdmin, meId, nowIso } from "../ops-helpers.mjs";
import { soyooClient } from "../soyoo-client.mjs";
import { logger } from "../../core/logger.mjs";

export const COLLAB_SCOPE_TICKETS = "tickets";
export const COLLAB_PERMISSION_VIEW = "view";
export const COLLAB_PERMISSION_HANDLE = "handle";

const ALLOWED_SCOPES = new Set([COLLAB_SCOPE_TICKETS, "project_pool", "people_progress"]);
const ALLOWED_PERMISSIONS = new Set([COLLAB_PERMISSION_VIEW, COLLAB_PERMISSION_HANDLE]);

function normalizeScope(scope) {
  const value = String(scope || COLLAB_SCOPE_TICKETS).trim();
  return ALLOWED_SCOPES.has(value) ? value : COLLAB_SCOPE_TICKETS;
}

function normalizePermission(permission) {
  const value = String(permission || COLLAB_PERMISSION_HANDLE).trim();
  return ALLOWED_PERMISSIONS.has(value) ? value : COLLAB_PERMISSION_HANDLE;
}

function normalizeUserId(value) {
  return String(value || "").trim();
}

function mapSoyooUser(row) {
  const tags = Array.isArray(row.tags)
    ? row.tags
        .map((tag) =>
          typeof tag === "string"
            ? { name: tag.trim(), color: "" }
            : { name: String(tag?.name ?? tag?.Name ?? "").trim(), color: String(tag?.color ?? tag?.Color ?? "").trim() },
        )
        .filter((tag) => tag.name)
    : [];
  return {
    id: String(row.id ?? row.ID ?? ""),
    username: row.username ?? "",
    name: row.nickname || row.name || row.username || "",
    wechatName: row.wechat_name ?? row.wechatName ?? "",
    avatar: row.wechat_avatar_url || row.wechat_avatar || row.avatar || "",
    tags,
    disabledAt: String(row.status || "").toLowerCase() === "disabled" ? row.updated_at || row.updatedAt || "" : null,
  };
}

async function listLocalCollaborationUsers() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, username, name, wechat_name, wechat_avatar, disabled_at
     FROM people
     WHERE disabled_at IS NULL
     ORDER BY CONVERT(name USING gbk) ASC, username ASC`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    username: row.username ?? "",
    name: row.name ?? "",
    wechatName: row.wechat_name ?? "",
    avatar: row.wechat_avatar ?? "",
    tags: [],
    disabledAt: row.disabled_at ?? null,
  }));
}

export async function listCollaborationUsers() {
  try {
    const rows = await soyooClient.users();
    return rows.map(mapSoyooUser).filter((user) => user.id && !user.disabledAt);
  } catch (error) {
    logger.warn(error, { label: "ops-collaboration-users:fallback-local" });
    return listLocalCollaborationUsers();
  }
}

export async function listCollaborationPermissions({ scope = COLLAB_SCOPE_TICKETS } = {}) {
  const s = normalizeScope(scope);
  const rows = await prisma.$queryRawUnsafe(
    `SELECT
       p.id,
       p.viewer_user_id,
       p.target_user_id,
       p.scope,
       p.permission,
       p.enabled,
       p.created_at,
       p.updated_at,
       viewer.username AS viewer_username,
       viewer.name AS viewer_name,
       viewer.wechat_name AS viewer_wechat_name,
       viewer.wechat_avatar AS viewer_avatar,
       target.username AS target_username,
       target.name AS target_name,
       target.wechat_name AS target_wechat_name,
       target.wechat_avatar AS target_avatar
     FROM ops_user_collaboration_permissions p
     LEFT JOIN people viewer ON viewer.id = p.viewer_user_id
     LEFT JOIN people target ON target.id = p.target_user_id
     WHERE p.scope = ? AND p.deleted_at IS NULL
     ORDER BY CONVERT(viewer.name USING gbk) ASC, CONVERT(target.name USING gbk) ASC, p.id ASC`,
    s,
  );
  const liveUsers = await listCollaborationUsers().catch(() => []);
  const liveUserById = new Map(liveUsers.map((user) => [String(user.id), user]));
  return rows.map((row) => ({
    id: Number(row.id),
    viewerUserId: String(row.viewer_user_id),
    viewerUsername: row.viewer_username ?? liveUserById.get(String(row.viewer_user_id))?.username ?? "",
    viewerName: row.viewer_name ?? liveUserById.get(String(row.viewer_user_id))?.name ?? liveUserById.get(String(row.viewer_user_id))?.wechatName ?? "",
    viewerWechatName: row.viewer_wechat_name ?? liveUserById.get(String(row.viewer_user_id))?.wechatName ?? "",
    viewerAvatar: row.viewer_avatar ?? liveUserById.get(String(row.viewer_user_id))?.avatar ?? "",
    targetUserId: String(row.target_user_id),
    targetUsername: row.target_username ?? liveUserById.get(String(row.target_user_id))?.username ?? "",
    targetName: row.target_name ?? liveUserById.get(String(row.target_user_id))?.name ?? liveUserById.get(String(row.target_user_id))?.wechatName ?? "",
    targetWechatName: row.target_wechat_name ?? liveUserById.get(String(row.target_user_id))?.wechatName ?? "",
    targetAvatar: row.target_avatar ?? liveUserById.get(String(row.target_user_id))?.avatar ?? "",
    scope: row.scope,
    permission: row.permission,
    enabled: Number(row.enabled) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function saveCollaborationPermissions({ viewerUserId, targetUserIds, scope = COLLAB_SCOPE_TICKETS, permission = COLLAB_PERMISSION_HANDLE, actorUser }) {
  const viewerId = normalizeUserId(viewerUserId);
  if (!viewerId) return { error: "请选择授权人" };
  const targetIds = [...new Set((targetUserIds || []).map(normalizeUserId).filter((id) => id && id !== viewerId))];
  const s = normalizeScope(scope);
  const p = normalizePermission(permission);
  const actorId = actorUser ? meId(actorUser) : "";
  const now = nowIso();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.$queryRawUnsafe(
      `SELECT id, target_user_id FROM ops_user_collaboration_permissions WHERE viewer_user_id = ? AND scope = ?`,
      viewerId,
      s,
    );
    const existingByTarget = new Map(existing.map((row) => [String(row.target_user_id), Number(row.id)]));
    const targetSet = new Set(targetIds);

    for (const row of existing) {
      const targetId = String(row.target_user_id);
      if (!targetSet.has(targetId)) {
        await tx.$executeRawUnsafe(
          `UPDATE ops_user_collaboration_permissions
           SET enabled = 0, deleted_at = ?, updated_at = ?
           WHERE id = ?`,
          now,
          now,
          Number(row.id),
        );
      }
    }

    for (const targetId of targetIds) {
      const existingId = existingByTarget.get(targetId);
      if (existingId) {
        await tx.$executeRawUnsafe(
          `UPDATE ops_user_collaboration_permissions
           SET permission = ?, enabled = 1, deleted_at = NULL, updated_at = ?
           WHERE id = ?`,
          p,
          now,
          existingId,
        );
      } else {
        await tx.$executeRawUnsafe(
          `INSERT INTO ops_user_collaboration_permissions
             (viewer_user_id, target_user_id, scope, permission, enabled, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
          viewerId,
          targetId,
          s,
          p,
          actorId,
          now,
          now,
        );
      }
    }
  });

  return { permissions: await listCollaborationPermissions({ scope: s }) };
}

export async function saveMutualCollaborationPermissions({ userIds, scope = COLLAB_SCOPE_TICKETS, actorUser }) {
  const memberIds = [...new Set((userIds || []).map(normalizeUserId).filter(Boolean))];
  if (memberIds.length < 2) return { error: "工单互通至少需要选择 2 个人" };
  const s = normalizeScope(scope);
  const actorId = actorUser ? meId(actorUser) : "";
  const now = nowIso();

  await prisma.$transaction(async (tx) => {
    for (const viewerId of memberIds) {
      for (const targetId of memberIds) {
        if (viewerId === targetId) continue;
        const existing = await tx.$queryRawUnsafe(
          `SELECT id FROM ops_user_collaboration_permissions
           WHERE viewer_user_id = ? AND target_user_id = ? AND scope = ?
           ORDER BY id ASC LIMIT 1`,
          viewerId,
          targetId,
          s,
        );
        const existingId = Number(existing?.[0]?.id || 0);
        if (existingId) {
          await tx.$executeRawUnsafe(
            `UPDATE ops_user_collaboration_permissions
             SET permission = ?, enabled = 1, deleted_at = NULL, updated_at = ?
             WHERE id = ?`,
            COLLAB_PERMISSION_HANDLE,
            now,
            existingId,
          );
        } else {
          await tx.$executeRawUnsafe(
            `INSERT INTO ops_user_collaboration_permissions
               (viewer_user_id, target_user_id, scope, permission, enabled, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
            viewerId,
            targetId,
            s,
            COLLAB_PERMISSION_HANDLE,
            actorId,
            now,
            now,
          );
        }
      }
    }
  });

  return { permissions: await listCollaborationPermissions({ scope: s }) };
}

export async function deleteCollaborationPermission(id) {
  const permissionId = Number(id);
  if (!Number.isInteger(permissionId) || permissionId <= 0) return { error: "授权记录不存在" };
  const result = await prisma.$executeRawUnsafe(
    `UPDATE ops_user_collaboration_permissions
     SET enabled = 0, deleted_at = ?, updated_at = ?
     WHERE id = ?`,
    nowIso(),
    nowIso(),
    permissionId,
  );
  if (!result) return { error: "授权记录不存在" };
  return { ok: true };
}

export async function buildTicketCollaborationAccess(user) {
  const userId = meId(user);
  if (isAdmin(user)) {
    return { userId, admin: true, viewOwnerIds: null, handleOwnerIds: null };
  }
  const rows = await prisma.$queryRawUnsafe(
    `SELECT target_user_id, permission
     FROM ops_user_collaboration_permissions
     WHERE viewer_user_id = ?
       AND scope = ?
       AND enabled = 1
       AND deleted_at IS NULL`,
    userId,
    COLLAB_SCOPE_TICKETS,
  );
  const viewOwnerIds = new Set([userId]);
  const handleOwnerIds = new Set([userId]);
  for (const row of rows) {
    const targetId = String(row.target_user_id || "").trim();
    if (!targetId) continue;
    viewOwnerIds.add(targetId);
    if (row.permission === COLLAB_PERMISSION_HANDLE) handleOwnerIds.add(targetId);
  }
  return { userId, admin: false, viewOwnerIds, handleOwnerIds };
}

export function canViewTicket(access, ticket) {
  if (access.admin) return true;
  if (String(ticket.requester_id) === access.userId) return true;
  return access.viewOwnerIds?.has(String(ticket.owner_id)) ?? false;
}

export function canHandleTicket(access, ticket) {
  if (access.admin) return true;
  return access.handleOwnerIds?.has(String(ticket.owner_id)) ?? false;
}
