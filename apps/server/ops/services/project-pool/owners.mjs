import { prisma } from "../../prisma.mjs";

// 按负责人查看:按 soyoo 标签名过滤项目成员。当前仍兼容旧 project_member_tags + tickets 快照两种来源。
export async function listOwnerMembersByTags({ projectIds = [], tagNames = [] }) {
  const ids = [...new Set((projectIds ?? []).map(String).filter(Boolean))];
  const names = [...new Set((tagNames ?? []).map(String).map((s) => s.trim()).filter(Boolean))];
  if (!ids.length || !names.length) return { members: [] };

  const tagRows = await prisma.tags.findMany({ where: { name: { in: names } }, select: { id: true, name: true } });
  const tagIds = tagRows.map((tag) => tag.id);
  const tagNameById = new Map(tagRows.map((tag) => [tag.id, tag.name]));
  const merged = new Map();

  if (tagIds.length) {
    const rows = await prisma.project_member_tags.findMany({
      where: { project_id: { in: ids }, tag_id: { in: tagIds } },
      select: {
        project_id: true,
        tag_id: true,
        people: { select: { id: true, username: true, name: true, wechat_avatar: true, wechat_name: true, disabled_at: true } },
      },
    });

    for (const row of rows) {
      const person = row.people;
      if (!person) continue;
      const key = `${row.project_id}:${person.id}`;
      const item =
        merged.get(key) || {
          projectId: String(row.project_id),
          id: String(person.id),
          username: person.username || "",
          name: person.name || person.username || "",
          avatar: person.wechat_avatar || "",
          wechatName: person.wechat_name || "",
          hireDate: "",
          status: person.disabled_at ? "disabled" : "",
          tags: [],
        };
      const tagName = tagNameById.get(row.tag_id);
      if (tagName && !item.tags.includes(tagName)) item.tags.push(tagName);
      merged.set(key, item);
    }
  }

  const ticketRows = await prisma.tickets.findMany({
    where: { project_id: { in: ids }, tag_name: { in: names }, status: { not: "已完成" } },
    select: {
      project_id: true,
      tag_name: true,
      owner_id: true,
      owner_username: true,
      owner_name: true,
      owner_avatar: true,
    },
  });
  for (const ticket of ticketRows) {
    if (!ticket.owner_id) continue;
    const key = `${ticket.project_id}:${ticket.owner_id}`;
    const item =
      merged.get(key) || {
        projectId: String(ticket.project_id),
        id: String(ticket.owner_id),
        username: ticket.owner_username || "",
        name: ticket.owner_name || ticket.owner_username || "",
        avatar: ticket.owner_avatar || "",
        wechatName: "",
        hireDate: "",
        status: "",
        tags: [],
      };
    if (ticket.tag_name && !item.tags.includes(ticket.tag_name)) {
      item.tags.push(ticket.tag_name);
    }
    merged.set(key, item);
  }

  await fillPeopleMeta([...merged.values()]);
  return { members: [...merged.values()] };
}

function userIdCandidates(userId) {
  const id = String(userId || "");
  if (!id) return [];
  return id.startsWith("ops-user-") ? [id, id.replace(/^ops-user-/, "")] : [id, `ops-user-${id}`];
}

async function fillPeopleMeta(members) {
  const rawIds = [...new Set(members.flatMap((member) => userIdCandidates(member.id)))].filter(Boolean);
  if (!rawIds.length) return;
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, hire_date, disabled_at FROM people WHERE id IN (${rawIds.map(() => "?").join(",")})`,
    ...rawIds,
  );
  const metaById = new Map(rows.map((row) => [String(row.id), { hireDate: String(row.hire_date || ""), disabled: !!row.disabled_at }]));
  for (const member of members) {
    const meta = userIdCandidates(member.id).map((id) => metaById.get(id)).find(Boolean);
    member.hireDate = meta?.hireDate || "";
    if (meta?.disabled) member.status = "disabled";
  }
}
