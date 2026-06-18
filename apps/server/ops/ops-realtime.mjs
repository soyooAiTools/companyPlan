// ops 提单"实时查 soyoo"封装:选项目/选负责人/算环节负责人/建单快照。
// 全部走 soyoo-client(/integration);不读本地 people/projects 表。
import { soyooClient } from "./soyoo-client.mjs";

// 我参与的项目(提单选项目下拉)
export async function listMyProjects(user) {
  const data = await soyooClient.myProjects(user.id);
  return (data?.projects ?? []).map((p) => ({
    id: String(p.project_id),
    name: p.project_name ?? "",
    clientId: String(p.tenant_id ?? ""),
    client: p.tenant_name ?? "",
    status: p.project_status ?? "",
  }));
}

// 项目 + 成员(建单校验 / 选负责人 / 指派候选 / 算环节负责人)
export async function getProjectWithMembers(projectId) {
  const data = await soyooClient.projectMembers(projectId);
  const project = data?.project
    ? {
        id: String(data.project.id),
        name: data.project.name ?? "",
        clientId: String(data.project.tenant_id ?? ""),
        client: data.project.tenant_name ?? "",
        status: data.project.status ?? "",
      }
    : null;
  const members = (data?.members ?? []).map((m) => ({
    id: String(m.user_id),
    username: m.username ?? "",
    name: m.nickname || m.username || "",
    avatar: m.wechat_avatar_url ?? "",
    wechatName: m.wechat_name ?? "",
    status: m.user_status ?? "",
    tags: (m.tags ?? []).map((t) => ({ id: String(t.id), name: t.name ?? "" })),
  }));
  return { project, members };
}

// 单个用户(提单人快照 / 刷快照)
export async function getUser(userId) {
  const u = await soyooClient.user(userId);
  if (!u) return null;
  return {
    id: String(u.id),
    username: u.username ?? "",
    name: u.nickname || u.username || "",
    avatar: u.wechat_avatar_url ?? "",
    wechatName: u.wechat_name ?? "",
  };
}

export async function listTenants(opts = {}) {
  const data = await soyooClient.tenants(opts);
  return (Array.isArray(data) ? data : []).map((t) => ({ id: String(t.id), name: t.name ?? "" }));
}

export async function listTags() {
  const data = await soyooClient.tags();
  return (Array.isArray(data) ? data : []).map((t) => ({ id: String(t.id), name: t.name ?? "", color: t.color ?? "" }));
}

// 环节负责人:成员标签 ∈ 环节绑定标签。segments:[{id,name,tags:[{id,name}]}](来自本地 ops)
export async function getResponsibles(projectId, segments) {
  const { members } = await getProjectWithMembers(projectId);
  const active = members.filter((m) => m.status !== "disabled");
  const segList = [];
  for (const seg of segments) {
    const tagIds = (seg.tags ?? []).map((t) => String(t.id));
    if (!tagIds.length) continue;
    const segMembers = active
      .filter((m) => m.tags.some((t) => tagIds.includes(t.id)))
      .map((m) => ({ id: m.id, username: m.username, name: m.name, wechatName: m.wechatName, wechatAvatar: m.avatar }));
    if (segMembers.length) segList.push({ id: seg.id, name: seg.name, members: segMembers });
  }
  const allMembers = [];
  for (const m of active) {
    const segmentIds = segments
      .filter((seg) => (seg.tags ?? []).length && m.tags.some((t) => seg.tags.some((st) => String(st.id) === t.id)))
      .map((seg) => seg.id);
    if (segmentIds.length) allMembers.push({ id: m.id, username: m.username, name: m.name, wechatName: m.wechatName, wechatAvatar: m.avatar, segmentIds });
  }
  return { segments: segList, members: allMembers };
}

// 建单快照:实时查 soyoo,验证 owner 属于该项目该环节,返回要写进工单的快照字段(或 {error})。
// segTags:[{id,name}] 该环节绑定的标签(来自本地 ops_segment_tags + 名字)。
export async function buildTicketSnapshot({ projectId, ownerId, requesterUserId, segTags }) {
  const segTagIds = (segTags ?? []).map((t) => String(t.id));
  if (!segTagIds.length) return { error: "该环节未绑定任何标签" };
  const { project, members } = await getProjectWithMembers(projectId);
  if (!project) return { error: "项目不存在" };
  const member = members.find((m) => m.id === String(ownerId));
  if (!member) return { error: "负责人不在该项目" };
  const matched = member.tags.find((t) => segTagIds.includes(t.id));
  if (!matched) return { error: "负责人不属于该环节(标签不匹配)" };
  const requesterUser = await getUser(requesterUserId);
  return {
    snapshot: {
      project_id: project.id,
      project_name: project.name,
      project_status: project.status,
      client_id: project.clientId,
      client_name: project.client,
      owner_id: String(ownerId),
      owner_name: member.name,
      owner_avatar: member.avatar,
      owner_username: member.username,
      requester_id: String(requesterUserId),
      requester_name: requesterUser?.name ?? "",
      requester_avatar: requesterUser?.avatar ?? "",
      requester_username: requesterUser?.username ?? "",
      tag_id: matched.id,
      tag_name: matched.name,
    },
  };
}
