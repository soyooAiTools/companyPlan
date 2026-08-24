import crypto from "node:crypto";
import { prisma } from "../ops/prisma.mjs";
import { effectiveSegmentTagIds } from "../ops/segment-tag-match.mjs";
import { addBusinessHours } from "../ops/business-hours.mjs";
import { nowIso } from "../ops/ops-helpers.mjs";

const AUTO_PROGRAM_SEGMENT = "程序第一版";
const AUTO_PROGRAM_SEGMENT_FALLBACK = "程序";
const AUTO_PROGRAM_TITLE = "立项：程序第一版(系统生成)";
const AUTO_PROGRAM_HTML = "<p>系统自动生成</p>";
const BACKFILL_PROGRAM_TITLE = "立项：程序第一版(系统补单)";
const SYSTEM_NOTE = "补单";
const DEFAULT_FROM_DATE = "2026-08-20";
const PROGRAM_OWNER_TAG_NAME_FALLBACKS = ["unity开发", "cocos开发", "程序", "开发"];

function argValue(name, fallback = "") {
  const hit = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
}

function todayDateText() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateStart(dateText) {
  return new Date(`${dateText}T00:00:00+08:00`);
}

function parseDateEndExclusive(dateText) {
  const end = parseDateStart(dateText);
  end.setDate(end.getDate() + 1);
  return end;
}

const apply = process.argv.includes("--apply");
const fromDate = argValue("--from", DEFAULT_FROM_DATE);
const toDate = argValue("--to", todayDateText());
const since = parseDateStart(fromDate);
const until = parseDateEndExclusive(toDate);
const onlyVersionIds = new Set(
  argValue("--version-ids", "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);

function isExcludedTenantName(name) {
  const text = String(name || "").toLowerCase();
  return text.includes("test") || text.includes("测试");
}

function isRecent(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) && time >= since.getTime() && time < until.getTime();
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function memberTags(member) {
  return Array.isArray(member?.tags)
    ? member.tags
        .map((tag) => {
          if (typeof tag === "string") return { id: "", name: tag };
          return { id: String(tag?.id || ""), name: String(tag?.name || "") };
        })
        .filter((tag) => tag.id || tag.name)
    : [];
}

function memberHasAnyTag(member, tagIdsOrNames) {
  const expected = new Set(tagIdsOrNames.map(String));
  return memberTags(member).some((tag) => expected.has(String(tag.id)) || expected.has(String(tag.name)));
}

function snapshotRowTargets(row) {
  const tenantName = row.tenantName || row.tenant_name || "";
  if (isExcludedTenantName(tenantName)) return [];
  const projectLifecycleStatus = String(row.projectLifecycleStatus || row.project_lifecycle_status || "").trim();
  if (["已完成", "回收中", "已回收", "客户暂停"].includes(projectLifecycleStatus)) return [];

  const base = {
    projectId: String(row.projectId || row.project_id || row.id || ""),
    projectName: row.name || row.projectName || "",
    tenantName,
    tenantId: String(row.tenantId || row.tenant_id || ""),
  };
  const versionRows = Array.isArray(row.children) && row.children.length ? row.children : [row];
  return versionRows
    .filter((version) => version?.versionId && isRecent(version.startedAt || version.started_at))
    .filter((version) => !["已完成", "回收中", "已回收", "客户暂停"].includes(String(version.status || "").trim()))
    .map((version) => ({
      ...base,
      versionId: String(version.versionId),
      versionCode: version.versionCode || "",
      versionName: version.versionName || "",
      status: version.status || row.status || "",
      members: Array.isArray(version.members) && version.members.length ? version.members : row.members || [],
    }));
}

async function loadTargetsFromOnlineSnapshot() {
  const rows = await prisma.ops_project_pool_snapshot.findMany({
    select: { row_json: true },
  });
  const targets = rows.flatMap((row) => snapshotRowTargets(parseJson(row.row_json, null) || {}));
  return onlyVersionIds.size ? targets.filter((target) => onlyVersionIds.has(String(target.versionId))) : targets;
}

async function findProgramSegment() {
  const primary = await prisma.ops_segments.findFirst({ where: { name: AUTO_PROGRAM_SEGMENT } });
  if (primary) return primary;
  return prisma.ops_segments.findFirst({ where: { name: AUTO_PROGRAM_SEGMENT_FALLBACK } });
}

async function loadProgramTagIds(segmentId) {
  const [links, tags] = await Promise.all([
    prisma.ops_segment_tags.findMany({ where: { segment_id: segmentId }, select: { tag_id: true } }),
    prisma.tags.findMany({ select: { id: true, name: true } }).catch(() => []),
  ]);
  const tagNameById = new Map(tags.map((tag) => [String(tag.id), tag.name]));
  return [
    ...effectiveSegmentTagIds(links.map((row) => ({ id: String(row.tag_id), name: tagNameById.get(String(row.tag_id)) ?? String(row.tag_id) }))),
    ...PROGRAM_OWNER_TAG_NAME_FALLBACKS,
  ];
}

function pickOwner(members, tagIds) {
  return [...members]
    .filter((member) => member.status !== "disabled" && memberHasAnyTag(member, tagIds))
    .sort((a, b) => String(a.assignedAt || "").localeCompare(String(b.assignedAt || "")) || Number(a.id) - Number(b.id))
    .at(-1);
}

function pickRequester(members) {
  const planner = [...members]
    .filter((member) => member.status !== "disabled" && memberHasAnyTag(member, ["制片"]))
    .sort((a, b) => String(a.assignedAt || "").localeCompare(String(b.assignedAt || "")) || Number(a.id) - Number(b.id))
    .at(-1);
  return planner || null;
}

async function existingTicket(projectId, versionId, segment) {
  return prisma.tickets.findFirst({
    where: {
      project_id: String(projectId),
      project_version_id: String(versionId),
      OR: [
        { title: { in: [AUTO_PROGRAM_TITLE, BACKFILL_PROGRAM_TITLE] } },
        { segment_id: segment.id },
        { discipline: { in: [AUTO_PROGRAM_SEGMENT, AUTO_PROGRAM_SEGMENT_FALLBACK] } },
      ],
    },
    select: { id: true, title: true, discipline: true },
  });
}

async function createProgramTicket({ project, version, members, segment, tagIds }) {
  const projectId = String(project.id);
  const versionId = String(version.id);
  const owner = pickOwner(members, tagIds);
  if (!owner) return { created: false, reason: "owner_not_found" };

  const requester = pickRequester(members);
  if (!requester?.id) return { created: false, reason: "requester_not_found" };

  const matchedTag = memberTags(owner).find((tag) => tagIds.includes(String(tag.id)) || tagIds.includes(String(tag.name)));
  const now = nowIso();
  const dueAt = addBusinessHours(now, segment.default_delivery_hours);
  const warnAt = addBusinessHours(now, segment.risk_warning_hours);
  const ticket = await prisma.tickets.create({
    data: {
      id: crypto.randomUUID(),
      title: BACKFILL_PROGRAM_TITLE,
      source_project_name: project.client || "",
      client_id: project.clientId || "",
      client_name: project.client || "",
      project_name: project.name || "",
      project_id: projectId,
      project_version_id: versionId,
      project_version_code: version.code || "",
      project_version_name: version.name || "",
      project_status: version.status || project.status || "",
      tag_id: matchedTag?.id || tagIds[0] || "",
      tag_name: matchedTag?.name || "",
      segment_id: segment.id,
      discipline: segment.name,
      requester_id: String(requester.id),
      requester_name: requester?.name || "",
      requester_avatar: requester?.avatar || "",
      requester_username: requester?.username || "",
      owner_id: String(owner.id),
      owner_name: owner.name || owner.username || "",
      owner_avatar: owner.avatar || "",
      owner_username: owner.username || "",
      status: "排队中",
      priority: "普通",
      start_at: now,
      due_in_hours: segment.default_delivery_hours,
      risk_warning_hours: segment.risk_warning_hours,
      due_at: dueAt,
      warn_at: warnAt,
      need_type: segment.name,
      summary: "系统自动生成",
      content_html: AUTO_PROGRAM_HTML,
      hyperlink: null,
      text: null,
      created_at: now,
      updated_at: now,
      status_updated_at: now,
    },
  });
  await prisma.ticket_events.create({
    data: {
      ticket_id: ticket.id,
      actor_id: String(requester.id),
      actor_name: requester?.name || "",
      action: "系统自动建单",
      from_status: null,
      to_status: "排队中",
      note: SYSTEM_NOTE,
      created_at: now,
    },
  });
  return { created: true, ticketId: ticket.id, ownerId: owner.id, requesterId: requester.id };
}

async function main() {
  const segment = await findProgramSegment();
  if (!segment) throw new Error(`未找到环节: ${AUTO_PROGRAM_SEGMENT}/${AUTO_PROGRAM_SEGMENT_FALLBACK}`);
  const tagIds = await loadProgramTagIds(segment.id);
  if (!tagIds.length) throw new Error(`环节 ${segment.name} 未绑定标签`);

  const targets = await loadTargetsFromOnlineSnapshot();

  let created = 0;
  let skipped = 0;
  let failed = 0;
  console.log(`[program-first-backfill] mode=${apply ? "apply" : "dry-run"} from=${fromDate} to=${toDate} targets=${targets.length}`);

  for (const target of targets) {
    const exists = await existingTicket(target.projectId, target.versionId, segment);
    if (exists) {
      skipped += 1;
      console.log(`SKIP exists project=${target.projectId} version=${target.versionId} ticket=${exists.id} discipline=${exists.discipline || ""} ${target.projectName}`);
      continue;
    }
    if (!apply) {
      skipped += 1;
      console.log(`DRY missing project=${target.projectId} version=${target.versionId} ${target.projectName}`);
      continue;
    }
    try {
      const project = {
        id: target.projectId,
        name: target.projectName,
        clientId: target.tenantId,
        client: target.tenantName,
        status: target.status,
      };
      const members = Array.isArray(target.members) ? target.members : [];
      if (!project.id) {
        failed += 1;
        console.log(`FAIL project_not_found project=${target.projectId} version=${target.versionId} ${target.projectName}`);
        continue;
      }
      const result = await createProgramTicket({
        project: { ...project, versionId: target.versionId },
        version: { id: target.versionId, code: target.versionCode, name: target.versionName, status: target.status || "" },
        members,
        segment,
        tagIds,
      });
      if (result.created) {
        created += 1;
        console.log(`CREATE project=${target.projectId} version=${target.versionId} ticket=${result.ticketId} owner=${result.ownerId} ${target.projectName}`);
      } else {
        failed += 1;
        console.log(`FAIL ${result.reason} project=${target.projectId} version=${target.versionId} ${target.projectName}`);
      }
    } catch (error) {
      failed += 1;
      console.log(`FAIL error project=${target.projectId} version=${target.versionId} ${target.projectName}: ${error?.message || error}`);
    }
  }

  console.log(`[program-first-backfill] done created=${created} skipped=${skipped} failed=${failed}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
