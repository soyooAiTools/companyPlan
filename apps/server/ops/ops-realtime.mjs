// ops 提单"实时查 soyoo"封装:选项目/选负责人/算环节负责人/建单快照。
// 全部走 soyoo-client(/integration);不读本地 people/projects 表。
import { soyooClient } from "./soyoo-client.mjs";
import { effectiveSegmentTagIds } from "./segment-tag-match.mjs";

function mapProjectVersions(project) {
  return Array.isArray(project?.versions)
    ? project.versions
        .filter((version) => version?.id)
        .map((version) => ({
          id: String(version.id),
          code: version.code || "",
          name: version.name || "",
          isDefault: !!version.is_default || String(version.code || "").toLowerCase() === "v1",
        }))
    : [];
}

function mapBusinessScopes(scopes) {
  return Array.isArray(scopes)
    ? scopes
        .filter((scope) => scope?.id || scope?.ID)
        .map((scope) => ({
          id: String(scope.id ?? scope.ID),
          name: scope.name || "",
          code: scope.code || "",
        }))
    : [];
}

// 我参与的项目(提单选项目下拉)
export async function listMyProjects(user) {
  const data = await soyooClient.myProjects(user.id);
  return (data?.projects ?? [])
    .filter((p) => {
      const lifecycle = String(p.project_lifecycle_status || p.lifecycle_status || "").trim();
      return !lifecycle || lifecycle === "进行中" || lifecycle === "正常";
    }) // 只按项目级生命周期过滤，不按版本状态过滤
    .map((p) => ({
      id: String(p.project_id),
      name: p.project_name ?? "",
      clientId: String(p.tenant_id ?? ""),
      client: p.tenant_name ?? "",
      status: p.project_status ?? "",
      versions: mapProjectVersions(p),
    }));
}

// 管理员:项目级进行中的项目(提单选项目用)。soyoo 无 tenant 过滤,取全量(短缓存),由 handler 按客户筛
export async function listAllProjects() {
  const rows = await soyooClient.allProjects();
  return (rows ?? []).map((p) => ({
    id: String(p.id),
    name: p.name ?? "",
    clientId: String(p.tenant_id ?? ""),
    client: p.tenant_name ?? "",
    status: p.status ?? "",
    versions: mapProjectVersions(p),
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
    hireDate: m.hire_date ?? "",
    rating: m.rating ?? "",
    status: m.user_status ?? "",
    assignedAt: m.assigned_at ?? "",
    tags: (m.tags ?? []).map((t) => ({ id: String(t.id), name: t.name ?? "" })),
    businessScopes: mapBusinessScopes(m.business_scopes),
  }));
  return { project, members };
}

function withVersionProjectId(projectId, versionId) {
  const rawProjectId = String(projectId || "");
  if (!rawProjectId || rawProjectId.includes("::version-")) return rawProjectId;
  return versionId ? `${rawProjectId}::version-${versionId}` : rawProjectId;
}

function defaultVersionId(project) {
  const versions = Array.isArray(project?.versions) ? project.versions : [];
  const version = versions.find((item) => item?.is_default || item?.isDefault || String(item?.code || "").toLowerCase() === "v1") || versions[0];
  return version?.id ? String(version.id) : "";
}

// 工单改派候选成员:新工单带 versionId 直接查版本;旧工单没 versionId 时默认查 v1。
export async function getTicketProjectMembers(projectId, versionId = "") {
  const rawProjectId = String(projectId || "");
  if (!rawProjectId || rawProjectId.includes("::version-") || versionId) {
    return getProjectWithMembers(withVersionProjectId(rawProjectId, versionId));
  }
  try {
    const project = await soyooClient.project(rawProjectId);
    const fallbackVersionId = defaultVersionId(project);
    if (fallbackVersionId) return getProjectWithMembers(withVersionProjectId(rawProjectId, fallbackVersionId));
  } catch {
    // 旧项目或临时连接失败时回退项目级成员,让上层保持原错误处理。
  }
  return getProjectWithMembers(rawProjectId);
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
    hireDate: u.hire_date ?? "",
    rating: u.rating ?? "",
    isAdmin: !!u.is_admin,
    status: u.status ?? "",
    tags: Array.isArray(u.tags) ? u.tags : [], // 角色标签名(判定是否「制片/策划」用)
    businessScopes: mapBusinessScopes(u.business_scopes),
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
    const tagIds = effectiveSegmentTagIds(seg.tags);
    if (!tagIds.length) continue;
    const segMembers = active
      .filter((m) => m.tags.some((t) => tagIds.includes(t.id)))
      .map((m) => ({ id: m.id, username: m.username, name: m.name, wechatName: m.wechatName, wechatAvatar: m.avatar }));
    if (segMembers.length) segList.push({ id: seg.id, name: seg.name, members: segMembers });
  }
  const allMembers = [];
  for (const m of active) {
    const segmentIds = segments
      .filter((seg) => {
        const tagIds = effectiveSegmentTagIds(seg.tags);
        return tagIds.length && m.tags.some((t) => tagIds.includes(String(t.id)));
      })
      .map((seg) => seg.id);
    if (segmentIds.length) allMembers.push({ id: m.id, username: m.username, name: m.name, wechatName: m.wechatName, wechatAvatar: m.avatar, segmentIds });
  }
  return { segments: segList, members: allMembers };
}

// 建单快照:实时查 soyoo,验证 owner 属于该项目该环节,返回要写进工单的快照字段(或 {error})。
// segTags:[{id,name}] 该环节绑定的标签(来自本地 ops_segment_tags + 名字)。
export async function buildTicketSnapshot({ projectId, projectVersionId = "", ownerId, requesterUserId, segTags }) {
  const segTagIds = effectiveSegmentTagIds(segTags);
  if (!segTagIds.length) return { error: "该环节未绑定任何标签" };
  const baseProjectId = String(projectId || "").split("::version-")[0];
  const memberProjectRef = withVersionProjectId(baseProjectId, projectVersionId);
  const { project, members } = await getProjectWithMembers(memberProjectRef);
  if (!project) return { error: "项目不存在" };
  const member = members.find((m) => m.id === String(ownerId));
  if (!member) return { error: "负责人不在该项目" };
  const matched = member.tags.find((t) => segTagIds.includes(t.id));
  if (!matched) return { error: "负责人不属于该环节(标签不匹配)" };
  const requesterUser = await getUser(requesterUserId);
  return {
    snapshot: {
      project_id: baseProjectId,
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
