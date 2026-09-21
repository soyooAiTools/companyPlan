import { prisma } from "../../prisma.mjs";
import { soyooId } from "../../soyoo-client.mjs";

function rowChildren(row) {
  return Array.isArray(row?.children) ? row.children : [];
}

function flattenRows(rows) {
  return (Array.isArray(rows) ? rows : []).flatMap((row) => [row, ...flattenRows(rowChildren(row))]);
}

function withLegacyPrefix(id) {
  const value = String(id || "");
  return value.startsWith("ops-project-") ? value : `ops-project-${value}`;
}

function lookupIds(rowId) {
  const id = String(rowId || "");
  return id ? [...new Set([id, withLegacyPrefix(id)])] : [];
}

export function applyLatestStatusChanges(rows, logs, people = []) {
  const allRows = flattenRows(rows);
  const lookupToRowId = new Map();
  for (const row of allRows) {
    for (const lookupId of lookupIds(row?.id)) lookupToRowId.set(lookupId, String(row.id));
  }

  const avatarByUserId = new Map();
  for (const person of people) {
    const userId = soyooId(person?.id);
    if (userId && person?.wechat_avatar) avatarByUserId.set(userId, person.wechat_avatar);
  }

  // 调用方按 id 倒序传入。一个项目可能同时存在新 ID 和 ops-project- 旧 ID，
  // 第一次命中的就是该行最后一条状态修改记录。
  const latestByRowId = new Map();
  for (const log of Array.isArray(logs) ? logs : []) {
    const rowId = lookupToRowId.get(String(log?.project_id || ""));
    if (!rowId || latestByRowId.has(rowId)) continue;
    latestByRowId.set(rowId, {
      actorId: String(log.actor_id || ""),
      actorName: String(log.actor_name || ""),
      actorAvatar: avatarByUserId.get(soyooId(log.actor_id)) || "",
      changedAt: String(log.created_at || ""),
    });
  }

  const attach = (row) => ({
    ...row,
    latestStatusChange: latestByRowId.get(String(row?.id || "")) || null,
    ...(rowChildren(row).length ? { children: rowChildren(row).map(attach) } : {}),
  });
  return (Array.isArray(rows) ? rows : []).map(attach);
}

function dateBoundary(value, endOfDay) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const time = Date.parse(`${text}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+08:00`);
  return Number.isFinite(time) ? time : null;
}

export function filterRowsByLatestStatusChangeRange(rows, { from = "", to = "" } = {}) {
  const start = dateBoundary(from, false);
  const end = dateBoundary(to, true);
  if (start == null && end == null) return rows;

  const matches = (row) => {
    const time = Date.parse(String(row?.latestStatusChange?.changedAt || ""));
    if (!Number.isFinite(time)) return false;
    return (start == null || time >= start) && (end == null || time <= end);
  };

  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const children = rowChildren(row);
      if (!children.length) return matches(row) ? row : null;
      if (matches(row)) return row;
      const matchedChildren = children.filter(matches);
      return matchedChildren.length ? { ...row, children: matchedChildren } : null;
    })
    .filter(Boolean);
}

export async function attachLatestStatusChanges(rows) {
  const allRows = flattenRows(rows);
  const lookup = [...new Set(allRows.flatMap((row) => lookupIds(row?.id)))];
  if (!lookup.length) return rows;

  const logs = await prisma.ops_project_status_logs.findMany({
    where: { kind: "status", project_id: { in: lookup } },
    orderBy: { id: "desc" },
    select: { project_id: true, actor_id: true, actor_name: true, created_at: true },
  });
  const userIds = [...new Set(logs.map((row) => soyooId(row.actor_id)).filter(Boolean))];
  const candidates = [...userIds, ...userIds.map((id) => `ops-user-${id}`)];
  const people = candidates.length
    ? await prisma.people.findMany({
        where: { id: { in: candidates } },
        select: { id: true, wechat_avatar: true },
      })
    : [];
  return applyLatestStatusChanges(rows, logs, people);
}
