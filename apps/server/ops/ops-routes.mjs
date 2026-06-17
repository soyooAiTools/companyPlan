// 需求提单 —— 新接口(Prisma,挂 /api/ops/*)。环节=ops 自定义"分类",绑定 soyoo 标签。
import crypto from "node:crypto";
import sanitizeHtml from "sanitize-html";
import { prisma } from "./prisma.mjs";
import { isOssConfigured, uploadObject } from "./oss.mjs";
import { ossConfig } from "../config/runtime.mjs";

const PRIORITIES = new Set(["紧急", "优先", "普通", "低优先"]);
const STATUSES = ["排队中", "进行中", "阻塞", "已完成"];
const isAdmin = (user) => user?.roleKey === "admin";
const nowIso = () => new Date().toISOString();
const clip = (v, n) => (v == null ? "" : String(v)).slice(0, n);

// —— 富文本正文:白名单 sanitize(防存储型 XSS)+ 派生纯文本摘要 ——
const MAX_CONTENT_HTML = 8_000_000; // ~8MB,给 base64 内联图片留空间(列为 MEDIUMTEXT 16MB)
const SANITIZE_OPTS = {
  allowedTags: ["p", "br", "span", "strong", "b", "em", "i", "u", "s", "strike", "del", "mark", "ul", "ol", "li", "blockquote", "code", "pre", "h1", "h2", "h3", "h4", "a", "img", "video", "hr"],
  allowedAttributes: { a: ["href", "target", "rel"], img: ["src", "alt", "title"], video: ["src", "controls", "width", "height", "poster"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https", "data"] }, // 允许图片用 data: base64
  nonTextTags: ["script", "style", "noscript", "textarea"], // 连同标签内文本一并丢弃
  transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }) },
};
const sanitizeRichHtml = (html) => sanitizeHtml(String(html ?? ""), SANITIZE_OPTS).trim();
function htmlToPlain(html) {
  return String(html ?? "")
    .replace(/<\s*(br|\/p|\/li|\/h[1-6]|\/div)\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
const isBlankRich = (html) => (html ? (/<img/i.test(html) ? false : htmlToPlain(html) === "") : true);

function mapTicket(t, segNameById) {
  return {
    id: t.id,
    title: t.title,
    client: t.source_project_name ?? "", // 所属项目=客户名
    projectName: t.project_name ?? "",
    projectId: t.project_id,
    tagName: (t.segment_id != null && segNameById?.get(t.segment_id)) || t.discipline, // 环节名:优先按 segment_id 取「当前」名,回退历史快照
    needType: t.need_type,
    priority: t.priority,
    status: t.status,
    dueInHours: t.due_in_hours,
    ownerId: t.owner_id,
    ownerName: t.people_tickets_owner_idTopeople?.name ?? "",
    ownerAvatar: t.people_tickets_owner_idTopeople?.wechat_avatar ?? "",
    requesterId: t.requester_id,
    requesterName: t.people_tickets_requester_idTopeople?.name ?? "",
    requesterAvatar: t.people_tickets_requester_idTopeople?.wechat_avatar ?? "",
    summary: t.summary ?? "",
    contentHtml: t.content_html ?? "",
    hyperlink: t.hyperlink ?? "",
    blockReason: t.block_reason ?? "",
    riskWarningHours: t.risk_warning_hours ?? 8,
    createdAt: t.created_at,
    statusUpdatedAt: t.status_updated_at,
  };
}

// 权限标记:canEdit=改状态(负责人/管理员);canEditContent=改需求说明(提单人/管理员)
function withCanEdit(t, user, segNameById) {
  return {
    ...mapTicket(t, segNameById),
    canEdit: isAdmin(user) || t.owner_id === user?.id,
    canEditContent: isAdmin(user) || t.requester_id === user?.id,
  };
}

// 环节 id→当前名 映射:工单显示「环节」时按 segment_id 取当前名(改名即时反映,不依赖名字快照)
async function loadSegNameMap() {
  const rows = await prisma.ops_segments.findMany({ select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

function statusActionLabel(from, to) {
  if (to === "进行中" && from === "排队中") return "开始处理";
  if (to === "进行中" && from === "阻塞") return "继续处理";
  if (to === "进行中" && from === "已完成") return "重新打开";
  if (to === "阻塞") return "阻塞";
  if (to === "已完成") return "完成";
  return "状态变更";
}

async function logTicketEvent({ ticketId, user, action, fromStatus = null, toStatus = null, note = null }) {
  await prisma.ticket_events.create({
    data: {
      ticket_id: ticketId,
      actor_id: user?.id ?? null,
      actor_name: user?.name ?? user?.username ?? "",
      action,
      from_status: fromStatus,
      to_status: toStatus,
      note: note ? String(note).slice(0, 500) : null,
      created_at: nowIso(),
    },
  });
}

// 环节列表 + 各自绑定的标签(id 为 INT → JS number)
async function loadSegments() {
  const segments = await prisma.ops_segments.findMany({ orderBy: [{ sort_order: "asc" }, { name: "asc" }] });
  const links = await prisma.ops_segment_tags.findMany();
  const tagIds = [...new Set(links.map((l) => l.tag_id))];
  const tags = tagIds.length
    ? await prisma.tags.findMany({ where: { id: { in: tagIds } }, select: { id: true, name: true } })
    : [];
  const tagNameById = new Map(tags.map((t) => [t.id, t.name]));
  const bySeg = new Map();
  for (const l of links) {
    if (!bySeg.has(l.segment_id)) bySeg.set(l.segment_id, []);
    bySeg.get(l.segment_id).push({ id: l.tag_id, name: tagNameById.get(l.tag_id) ?? l.tag_id });
  }
  return segments.map((s) => ({
    id: s.id,
    name: s.name,
    defaultDeliveryHours: s.default_delivery_hours,
    riskWarningHours: s.risk_warning_hours,
    sortOrder: s.sort_order,
    tags: bySeg.get(s.id) ?? [],
  }));
}

const ticketInclude = {
  people_tickets_owner_idTopeople: { select: { name: true, username: true, wechat_avatar: true } },
  people_tickets_requester_idTopeople: { select: { name: true, username: true, wechat_avatar: true } },
};

export function registerOpsRoutes(app, { requireAuth, requireAdmin, opsSync }) {
  // 当前登录用户(供前端按角色显示菜单)
  app.get("/api/ops/me", requireAuth, async (req, res) => {
    const u = req.user || {};
    const p = await prisma.people.findUnique({ where: { id: String(u.id) }, select: { wechat_avatar: true, wechat_name: true } }).catch(() => null);
    res.json({ user: { id: u.id, name: u.name || u.username || "", username: u.username || "", roleKey: u.roleKey || "", isAdmin: u.roleKey === "admin", avatar: p?.wechat_avatar ?? "", wechatName: p?.wechat_name ?? "" } });
  });

  // 同步管理(仅管理员):配置 + 状态 + 最近记录
  app.get("/api/ops/sync", requireAuth, requireAdmin, async (_req, res) => {
    if (!opsSync) return res.status(503).json({ error: "同步调度未就绪" });
    const [config, logs] = await Promise.all([opsSync.getConfig(), opsSync.getLogs(20)]);
    res.json({ config, status: opsSync.getStatus(), logs });
  });

  // 改同步频率/开关(仅管理员):立即重排,无需重启
  app.put("/api/ops/sync", requireAuth, requireAdmin, async (req, res) => {
    if (!opsSync) return res.status(503).json({ error: "同步调度未就绪" });
    const b = req.body ?? {};
    const patch = {};
    if (b.intervalMinutes != null) patch.intervalMinutes = Number(b.intervalMinutes);
    if (b.enabled != null) patch.enabled = !!b.enabled;
    await opsSync.reschedule(patch);
    res.json({ config: await opsSync.getConfig() });
  });

  // 立即手动同步一次(仅管理员):后台跑、不阻塞请求(全量同步约 1 分钟);完成写入同步记录,前端轮询查看
  app.post("/api/ops/sync/run", requireAuth, requireAdmin, (req, res) => {
    if (!opsSync) return res.status(503).json({ error: "同步调度未就绪" });
    const actor = req.user?.name || req.user?.username || "管理员";
    void opsSync.runSync("manual", actor);
    res.json({ started: true });
  });

  // 原始 soyoo 标签(供环节配置页绑定)
  app.get("/api/ops/tags", requireAuth, async (_req, res) => {
    const tags = await prisma.tags.findMany({ orderBy: [{ sort_order: "asc" }, { name: "asc" }] });
    res.json({ tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })) });
  });

  // 富文本编辑器图片上传 → 阿里云 OSS,返回公开 URL。Body: { projectName, mime, dataBase64 }
  app.post("/api/ops/upload", requireAuth, async (req, res) => {
    if (!isOssConfigured()) return res.status(503).json({ error: "OSS 未配置(请在根 .env 填 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET)" });
    const b = req.body ?? {};
    const mime = String(b.mime || "").toLowerCase();
    if (!mime) return res.status(400).json({ error: "缺少文件类型" });
    const base64 = typeof b.dataBase64 === "string" ? b.dataBase64.replace(/^data:[^;]+;base64,/, "") : "";
    if (!base64) return res.status(400).json({ error: "缺少文件数据" });
    let buffer;
    try {
      buffer = Buffer.from(base64, "base64");
    } catch {
      return res.status(400).json({ error: "文件数据不合法" });
    }
    if (!buffer.length) return res.status(400).json({ error: "文件为空" });
    // 图片 ≤2MB;视频/压缩包等其它文件 ≤10MB
    const isImage = mime.startsWith("image/");
    const max = isImage ? ossConfig.maxImageBytes : ossConfig.maxFileBytes;
    if (buffer.length > max) return res.status(413).json({ error: isImage ? "图片过大(超过 2MB)" : "文件过大(超过 10MB)" });
    try {
      const url = await uploadObject({ projectId: b.projectId, filename: b.filename, buffer, mime });
      res.json({ url });
    } catch (e) {
      res.status(502).json({ error: e?.message || "上传失败" });
    }
  });

  // 客户
  app.get("/api/ops/tenants", requireAuth, async (_req, res) => {
    const tenants = await prisma.tenants.findMany({ orderBy: { name: "asc" } });
    res.json({ tenants: tenants.map((t) => ({ id: t.id, name: t.name })) });
  });

  // 项目(可按客户过滤)
  app.get("/api/ops/projects", requireAuth, async (req, res) => {
    const tenantId = req.query.tenantId ? String(req.query.tenantId) : null;
    const projects = await prisma.projects.findMany({
      where: tenantId ? { tenant_id: tenantId } : {},
      orderBy: { name: "asc" },
      select: { id: true, name: true, tenant_id: true, client: true, planner_name: true, developer_name: true, status: true },
    });
    res.json({
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        tenantId: p.tenant_id,
        client: p.client,
        plannerName: p.planner_name,
        developerName: p.developer_name,
        status: p.status,
      })),
    });
  });

  // 环节(分类)列表 + 绑定 + 配置
  app.get("/api/ops/segments", requireAuth, async (_req, res) => {
    res.json({ segments: await loadSegments() });
  });

  // 新建环节
  app.post("/api/ops/segments", requireAuth, requireAdmin, async (req, res) => {
    const name = clip(req.body?.name, 80).trim();
    if (!name) return res.status(400).json({ error: "环节名必填" });
    try {
      const seg = await prisma.ops_segments.create({
        data: { name, default_delivery_hours: 72, risk_warning_hours: 8, sort_order: 0, updated_at: nowIso() },
      });
      res.status(201).json({ segment: { id: seg.id, name: seg.name, defaultDeliveryHours: seg.default_delivery_hours, riskWarningHours: seg.risk_warning_hours, sortOrder: seg.sort_order, tags: [] } });
    } catch {
      res.status(400).json({ error: "环节名已存在或创建失败" });
    }
  });

  // 更新环节:配置(name/交付/阈值/排序)+ 绑定标签(tagIds 全量替换)
  app.put("/api/ops/segments/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "环节 id 不合法" });
    const b = req.body ?? {};
    const before = await prisma.ops_segments.findUnique({ where: { id }, select: { name: true } });
    const data = { updated_at: nowIso() };
    if (b.name != null) data.name = clip(b.name, 80).trim();
    if (b.defaultDeliveryHours != null) data.default_delivery_hours = Math.max(1, Math.min(720, Number(b.defaultDeliveryHours) || 72));
    if (b.riskWarningHours != null) data.risk_warning_hours = Math.max(1, Math.min(168, Number(b.riskWarningHours) || 8));
    if (b.sortOrder != null) data.sort_order = Number(b.sortOrder) || 0;
    try {
      await prisma.ops_segments.update({ where: { id }, data });
    } catch {
      return res.status(404).json({ error: "环节不存在" });
    }
    // 环节改名 → 同步存量工单的环节名(工单存的是名字快照,未按 id 关联)
    if (data.name && before && data.name !== before.name) {
      await prisma.tickets.updateMany({ where: { discipline: before.name }, data: { discipline: data.name } });
    }
    if (Array.isArray(b.tagIds)) {
      await prisma.ops_segment_tags.deleteMany({ where: { segment_id: id } });
      const rows = b.tagIds.map((t) => ({ segment_id: id, tag_id: String(t) })).filter((r) => r.tag_id);
      if (rows.length) await prisma.ops_segment_tags.createMany({ data: rows, skipDuplicates: true });
    }
    const segments = await loadSegments();
    res.json({ segment: segments.find((s) => s.id === id) ?? null });
  });

  // 删除环节
  app.delete("/api/ops/segments/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "环节 id 不合法" });
    await prisma.ops_segment_tags.deleteMany({ where: { segment_id: id } });
    await prisma.ops_segments.delete({ where: { id } }).catch(() => {});
    res.json({ ok: true });
  });

  // 该项目「环节 → 成员」:成员标签 ∈ 环节绑定标签(只返回有成员的环节)
  app.get("/api/ops/projects/:id/responsibles", requireAuth, async (req, res) => {
    const projectId = String(req.params.id);
    const memberRows = await prisma.project_member_tags.findMany({
      where: { project_id: projectId },
      include: { people: { select: { id: true, username: true, name: true, disabled_at: true, wechat_name: true, wechat_avatar: true } } },
    });
    const segments = await loadSegments();
    const byPerson = new Map();
    for (const m of memberRows) {
      if (m.people?.disabled_at) continue;
      if (!byPerson.has(m.person_id)) byPerson.set(m.person_id, { person: m.people, tags: new Set() });
      byPerson.get(m.person_id).tags.add(m.tag_id);
    }
    const segTagSets = segments.map((seg) => ({ seg, tagIds: new Set(seg.tags.map((t) => t.id)) }));
    const result = [];
    for (const { seg, tagIds } of segTagSets) {
      if (!tagIds.size) continue;
      const members = [];
      for (const { person, tags } of byPerson.values()) {
        if ([...tags].some((t) => tagIds.has(t))) members.push({ id: person.id, username: person.username, name: person.name, wechatName: person.wechat_name ?? "", wechatAvatar: person.wechat_avatar ?? "" });
      }
      if (members.length) result.push({ id: seg.id, name: seg.name, members });
    }
    // 全部可分配成员(有 ≥1 个被环节绑定的标签),附带其所属环节 id —— 供"不选环节列全部 / 选负责人回填环节"
    const allMembers = [];
    for (const { person, tags } of byPerson.values()) {
      const segmentIds = segTagSets.filter(({ tagIds }) => tagIds.size && [...tags].some((t) => tagIds.has(t))).map(({ seg }) => seg.id);
      if (segmentIds.length) allMembers.push({ id: person.id, username: person.username, name: person.name, wechatName: person.wechat_name ?? "", wechatAvatar: person.wechat_avatar ?? "", segmentIds });
    }
    res.json({ segments: result, members: allMembers });
  });

  // 提单列表 —— 需求提单是「个人数据」:始终只看与我相关(owner 或 requester),管理员也不例外。
  // scope: all=我相关的全部 / owner=我负责的 / requester=我提单的
  app.get("/api/ops/tickets", requireAuth, async (req, res) => {
    const user = req.user;
    const scope = String(req.query.scope ?? "all");
    let where;
    if (scope === "owner") where = { owner_id: user.id };
    else if (scope === "requester") where = { requester_id: user.id };
    else where = { OR: [{ owner_id: user.id }, { requester_id: user.id }] };
    // 列表不返回 content_html(富文本正文可能很大);点详情时再单独拉 /:id/content
    const tickets = await prisma.tickets.findMany({ where, orderBy: [{ created_at: "desc" }, { id: "desc" }], include: ticketInclude, omit: { content_html: true } });
    const segNameById = await loadSegNameMap();
    res.json({ tickets: tickets.map((t) => withCanEdit(t, user, segNameById)) });
  });

  // 建单:按环节(segmentId)。owner 须为该项目下、标签 ∈ 环节绑定标签 的成员
  app.post("/api/ops/tickets", requireAuth, async (req, res) => {
    const user = req.user;
    const b = req.body ?? {};
    const projectId = b.projectId ? String(b.projectId) : "";
    const segmentId = Number(b.segmentId);
    const ownerId = b.ownerId ? String(b.ownerId) : "";
    if (!projectId || !Number.isInteger(segmentId) || !ownerId) return res.status(400).json({ error: "项目、环节、负责人均必填" });

    // 富文本正文:限大小 → sanitize → 派生纯文本摘要(供列表/搜索)
    const rawHtml = b.contentHtml != null ? String(b.contentHtml) : "";
    if (rawHtml.length > MAX_CONTENT_HTML) return res.status(413).json({ error: "内容过大,请压缩图片后重试" });
    const contentHtml = isBlankRich(rawHtml) ? "" : sanitizeRichHtml(rawHtml);
    const summaryText = htmlToPlain(contentHtml) || clip(b.summary, 2000);

    const project = await prisma.projects.findUnique({ where: { id: projectId } });
    if (!project) return res.status(400).json({ error: "项目不存在" });
    const segment = await prisma.ops_segments.findUnique({ where: { id: segmentId } });
    if (!segment) return res.status(400).json({ error: "环节不存在" });
    const segTagIds = (await prisma.ops_segment_tags.findMany({ where: { segment_id: segmentId }, select: { tag_id: true } })).map((r) => r.tag_id);
    if (!segTagIds.length) return res.status(400).json({ error: "该环节未绑定任何标签" });
    const ownerMatch = await prisma.project_member_tags.findFirst({
      where: { project_id: projectId, person_id: ownerId, tag_id: { in: segTagIds } },
    });
    if (!ownerMatch) return res.status(400).json({ error: "负责人不属于该项目该环节" });

    let clientName = project.client || "";
    if (project.tenant_id) {
      const tenant = await prisma.tenants.findUnique({ where: { id: project.tenant_id } });
      if (tenant) clientName = tenant.name;
    }
    const now = nowIso();
    const created = await prisma.tickets.create({
      data: {
        id: crypto.randomUUID(),
        title: clip(b.title, 160) || "未命名需求",
        source_project_name: clip(clientName, 160),
        project_name: clip(project.name, 160),
        project_id: projectId,
        tag_id: "",
        segment_id: segmentId, // 关联环节(显示按 id 取当前名)
        discipline: clip(segment.name, 80), // 兼容历史:仍存环节名快照
        requester_id: user.id,
        owner_id: ownerId,
        status: "排队中",
        priority: PRIORITIES.has(b.priority) ? b.priority : "普通",
        start_at: now,
        due_in_hours: segment.default_delivery_hours,
        risk_warning_hours: segment.risk_warning_hours,
        need_type: clip(b.needType, 120) || segment.name,
        summary: clip(summaryText, 2000) || (contentHtml ? "[图片/附件]" : ""),
        content_html: contentHtml || null,
        hyperlink: b.hyperlink ? clip(b.hyperlink, 500) : null,
        text: b.text ? clip(b.text, 500) : null,
        created_at: now,
        updated_at: now,
        status_updated_at: now,
      },
      include: ticketInclude,
    });
    await logTicketEvent({ ticketId: created.id, user, action: "建单", toStatus: "排队中" });
    res.status(201).json({ ticket: withCanEdit(created, user, await loadSegNameMap()) });
  });

  // 改状态(仅负责人或管理员;提单人不能改,不满意线下沟通)
  app.patch("/api/ops/tickets/:id/status", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const status = String(req.body?.status ?? "");
    if (!STATUSES.includes(status)) return res.status(400).json({ error: "状态不合法" });
    const t = await prisma.tickets.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: "提单不存在" });
    const user = req.user;
    if (!isAdmin(user) && t.owner_id !== user.id) return res.status(403).json({ error: "无权修改(仅负责人或管理员)" });
    const now = nowIso();
    const reason = clip(req.body?.reason, 500) || null; // 完成/阻塞 的备注都记进流转记录
    const data = { status, updated_at: now, status_updated_at: now };
    if (status === "阻塞") data.block_reason = reason;
    const updated = await prisma.tickets.update({ where: { id }, data, include: ticketInclude });
    await logTicketEvent({ ticketId: id, user, action: statusActionLabel(t.status, status), fromStatus: t.status, toStatus: status, note: reason });
    res.json({ ticket: withCanEdit(updated, user, await loadSegNameMap()) });
  });

  // 改需求说明(富文本;仅提单人或管理员)。建单后正文可改,其它字段不可改。
  app.patch("/api/ops/tickets/:id", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const t = await prisma.tickets.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: "提单不存在" });
    const user = req.user;
    if (!isAdmin(user) && t.requester_id !== user.id) return res.status(403).json({ error: "无权修改(仅提单人或管理员)" });
    const rawHtml = req.body?.contentHtml != null ? String(req.body.contentHtml) : "";
    if (rawHtml.length > MAX_CONTENT_HTML) return res.status(413).json({ error: "内容过大,请压缩图片后重试" });
    const contentHtml = isBlankRich(rawHtml) ? "" : sanitizeRichHtml(rawHtml);
    const summaryText = htmlToPlain(contentHtml);
    const now = nowIso();
    const updated = await prisma.tickets.update({
      where: { id },
      data: { content_html: contentHtml || null, summary: clip(summaryText, 2000) || (contentHtml ? "[图片/附件]" : ""), updated_at: now },
      include: ticketInclude,
    });
    await logTicketEvent({ ticketId: id, user, action: "修改需求说明" });
    res.json({ ticket: withCanEdit(updated, user, await loadSegNameMap()) });
  });

  // 流转记录(时间线)
  app.get("/api/ops/tickets/:id/events", requireAuth, async (req, res) => {
    const events = await prisma.ticket_events.findMany({ where: { ticket_id: String(req.params.id) }, orderBy: [{ created_at: "asc" }, { id: "asc" }] });
    res.json({
      events: events.map((e) => ({ id: e.id, actorName: e.actor_name ?? "", action: e.action, fromStatus: e.from_status ?? "", toStatus: e.to_status ?? "", note: e.note ?? "", createdAt: e.created_at })),
    });
  });

  // 富文本正文(按需:点详情/查看/编辑时才拉,列表不返,避免列表带大字段)
  app.get("/api/ops/tickets/:id/content", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const t = await prisma.tickets.findUnique({ where: { id }, select: { content_html: true, owner_id: true, requester_id: true } });
    if (!t) return res.status(404).json({ error: "提单不存在" });
    const user = req.user;
    if (!isAdmin(user) && t.owner_id !== user.id && t.requester_id !== user.id) return res.status(403).json({ error: "无权查看" });
    res.json({ contentHtml: t.content_html ?? "" });
  });
}
