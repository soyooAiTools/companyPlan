import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const disciplines = ["美术", "UI", "模型", "动画", "研发", "音效"];
const localAdminId = "u-admin";

export function createOpsDirectorySync({ config, logger, syncDirectory }) {
  let inFlight = null;
  let lastAttemptAt = 0;
  let lastSuccessAt = 0;
  let lastResult = { active: false, reason: "not_synced" };

  async function sync({ force = false, reason = "scheduled" } = {}) {
    if (!config.enabled) {
      lastResult = { active: false, reason: "disabled" };
      return lastResult;
    }

    const now = Date.now();
    if (!force && lastSuccessAt > 0 && now - lastSuccessAt < config.cacheTtlMs) {
      return lastResult;
    }

    if (inFlight) return inFlight;
    lastAttemptAt = now;
    inFlight = (async () => {
      try {
        const directory = await fetchOpsDirectory(config, logger);
        await syncDirectory(directory);
        lastSuccessAt = Date.now();
        lastResult = {
          active: true,
          reason,
          syncedAt: new Date(lastSuccessAt).toISOString(),
          users: directory.people.length,
          projects: directory.projects.length,
          tenants: directory.tenants.length,
          tags: directory.tags.length,
        };
        logger.info("Ops directory synced", lastResult);
        return lastResult;
      } catch (error) {
        logger.error(error);
        lastResult = {
          ...lastResult,
          active: lastSuccessAt > 0,
          reason: "sync_failed",
          lastAttemptAt: new Date(lastAttemptAt).toISOString(),
          error: error instanceof Error ? error.message : String(error),
        };
        return lastResult;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  return {
    sync,
    getStatus() {
      return {
        ...lastResult,
        enabled: config.enabled,
        baseUrl: config.baseUrl,
        cacheTtlMs: config.cacheTtlMs,
      };
    },
  };
}

async function fetchOpsDirectory(config, logger) {
  const client = createOpsClient(config);
  const [users, tenants, projects, tags] = await Promise.all([
    client.listAll("users"),
    client.listAll("tenants"),
    client.listAll("projects"),
    client.listTags(),
  ]);

  logger.info("Ops base lists loaded", {
    users: users.length,
    tenants: tenants.length,
    projects: projects.length,
    tags: tags.length,
  });

  const userDetails = await mapLimit(users, config.concurrency, async (user) => {
    const [projectData, statsData] = await Promise.all([
      client.getUserProjects(user.id).catch(() => null),
      client.getUserProjectStats(user.id).catch(() => null),
    ]);
    return { user, projectData, statsData };
  });

  const projectsForMembers = config.projectMemberLimit > 0 ? projects.slice(0, config.projectMemberLimit) : projects;
  const projectMemberData = await mapLimit(projectsForMembers, config.concurrency, async (project) => {
    const data = await client.getProjectMembers(project.id).catch(() => null);
    return { projectId: project.id, data };
  });

  return normalizeOpsDirectory({
    config,
    users,
    tenants,
    projects,
    tags,
    userDetails,
    projectMemberData,
  });
}

function createOpsClient(config) {
  async function get(path, query = {}) {
    const url = new URL(path, ensureTrailingSlash(config.baseUrl));
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const payload = JSON.parse(await fetchOpsText(url, config.timeoutMs, controller.signal));
      if (payload?.code !== undefined && payload.code !== 0) {
        throw new Error(`Ops ${url.pathname} returned code ${payload.code}`);
      }
      if (payload?.error) throw new Error(`Ops ${url.pathname}: ${payload.error}`);
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function listAll(resource) {
    const limit = 100;
    const rows = [];
    let page = 1;
    let total = Infinity;

    while (rows.length < total) {
      const payload = await get(`/ops/${resource}`, { page, limit });
      const data = Array.isArray(payload?.data) ? payload.data : [];
      rows.push(...data);
      total = Number.isFinite(Number(payload?.total)) ? Number(payload.total) : rows.length;
      if (!data.length || data.length < limit) break;
      page += 1;
    }

    return rows;
  }

  return {
    listAll,
    async listTags() {
      const payload = await get("/ops/tags");
      return Array.isArray(payload?.data) ? payload.data : [];
    },
    async getProjectMembers(projectId) {
      const payload = await get(`/ops/projects/${encodeURIComponent(projectId)}/members`);
      return payload?.data ?? null;
    },
    async getUserProjects(userId) {
      const payload = await get(`/ops/users/${encodeURIComponent(userId)}/projects`);
      return payload?.data ?? null;
    },
    async getUserProjectStats(userId) {
      const payload = await get(`/ops/users/${encodeURIComponent(userId)}/project-stats`);
      return payload?.data ?? null;
    },
  };
}

async function fetchOpsText(url, timeoutMs, signal) {
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  try {
    const result = await execFileAsync(
      "curl",
      ["-fsS", "--connect-timeout", String(timeoutSeconds), "--max-time", String(timeoutSeconds), url.toString()],
      {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        signal,
      }
    );
    return result.stdout;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw new Error(`Ops ${url.pathname} curl failed: ${cleanCurlError(error)}`);
    }
  }

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Ops ${url.pathname} failed with ${response.status}`);
  return response.text();
}

function cleanCurlError(error) {
  return String(error?.stderr || error?.message || error).trim().slice(0, 500);
}

function normalizeOpsDirectory({ config, users, tenants, projects, tags, userDetails, projectMemberData }) {
  const tenantsById = new Map(tenants.map((tenant) => [String(tenant.id), tenant]));
  const projectRowsById = new Map(projects.map((project) => [String(project.id), project]));
  const tagNamesByUserId = new Map();
  const projectIdsByUserId = new Map();
  const userIdsByProjectId = new Map();
  const statsByUserId = new Map();

  for (const detail of userDetails) {
    const userId = String(detail.user.id);
    addUserTags(tagNamesByUserId, userId, detail.projectData?.tags);
    statsByUserId.set(userId, detail.statsData);
    for (const project of detail.projectData?.projects ?? []) {
      const projectId = String(project.project_id);
      addToSet(projectIdsByUserId, userId, projectId);
      addToSet(userIdsByProjectId, projectId, userId);
      if (!projectRowsById.has(projectId)) {
        projectRowsById.set(projectId, {
          id: project.project_id,
          name: project.project_name,
          tenant_id: project.tenant_id,
          tenant_name: project.tenant_name,
          status: project.project_status,
        });
      }
    }
  }

  for (const item of projectMemberData) {
    const projectId = String(item.projectId);
    for (const member of item.data?.members ?? []) {
      const userId = String(member.user_id);
      addToSet(projectIdsByUserId, userId, projectId);
      addToSet(userIdsByProjectId, projectId, userId);
      addUserTags(tagNamesByUserId, userId, member.tags);
    }
  }

  const userRowsById = new Map(users.map((user) => [String(user.id), user]));
  const people = Array.from(userRowsById.values()).map((user) => {
    const userId = String(user.id);
    const tagNames = Array.from(tagNamesByUserId.get(userId) ?? []);
    const identity = inferIdentity(user, tagNames, config);
    const projectIds = Array.from(projectIdsByUserId.get(userId) ?? []).map(toProjectId).sort(compareIds);
    const stats = statsByUserId.get(userId);
    const totalProjects = Number(stats?.total ?? projectIds.length);
    const doneProjects = (stats?.by_status ?? [])
      .filter((item) => ["已完成", "已反馈"].includes(String(item.status)))
      .reduce((sum, item) => sum + Number(item.count ?? 0), 0);

    return {
      id: toUserId(user.id),
      username: cleanUsername(user.username, user.id),
      name: cleanText(user.nickname, 120) || cleanUsername(user.username, user.id),
      roleKey: identity.roleKey,
      title: identity.title,
      discipline: identity.discipline,
      capacity: clampNumber(45 + totalProjects * 6, 35, 98),
      completion: totalProjects > 0 ? clampNumber(Math.round((doneProjects / totalProjects) * 100), 0, 100) : 0,
      projectIds,
    };
  });

  const peopleById = new Map(people.map((person) => [person.id, person]));
  const peopleByName = createPeopleNameIndex(people);
  const defaultAdmin = people.find((person) => person.roleKey === "admin")?.id ?? localAdminId;

  const normalizedProjects = Array.from(projectRowsById.values())
    .map((project) => {
      const opsProjectId = String(project.id);
      const teamIds = Array.from(userIdsByProjectId.get(opsProjectId) ?? [])
        .map(toUserId)
        .filter((id) => peopleById.has(id))
        .sort(compareIds);
      const ownerId =
        findPersonByName(peopleByName, project.planner_name) ??
        findPersonByName(peopleByName, project.developer_name) ??
        teamIds.find((id) => peopleById.get(id)?.roleKey === "producer") ??
        teamIds.find((id) => peopleById.get(id)?.roleKey === "programmer") ??
        defaultAdmin;
      const status = cleanText(project.status, 80) || "未启动";
      const progress = progressForStatus(status);

      if (ownerId && !teamIds.includes(ownerId) && peopleById.has(ownerId)) {
        teamIds.unshift(ownerId);
      }

      return {
        id: toProjectId(project.id),
        name: cleanText(project.name, 160) || `Ops 项目 ${project.id}`,
        client: cleanText(project.tenant_name, 160) || cleanText(tenantsById.get(String(project.tenant_id))?.name, 160) || "-",
        genre: "试玩广告",
        channel: "Ops",
        ownerId,
        status,
        phase: phaseForStatus(status),
        health: healthForStatus(status),
        progress,
        dueInDays: dueDaysForStatus(status),
        ticketCount: 0,
        openTicketCount: 0,
        teamIds,
        disciplineProgress: buildDisciplineProgress(teamIds, peopleById, progress),
        blocker: blockerForStatus(status),
      };
    })
    .sort((a, b) => compareIds(a.id, b.id));

  const projectNameOptions = buildTenantNameOptions(tenants);

  return {
    people,
    projects: normalizedProjects,
    tenants: tenants.map((tenant) => ({
      id: `ops-tenant-${tenant.id}`,
      name: cleanText(tenant.name, 160) || `客户 ${tenant.id}`,
      description: cleanText(tenant.description, 500),
    })),
    tags: tags.map((tag) => ({
      id: `ops-tag-${tag.id}`,
      name: cleanText(tag.name, 120) || `标签 ${tag.id}`,
      color: cleanText(tag.color, 40),
    })),
    projectNameOptions,
  };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit || 1, items.length || 1));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await fn(items[index], index);
      }
    })
  );
  return results;
}

function inferIdentity(user, tagNames, config) {
  const username = cleanUsername(user.username, user.id);
  const developerType = cleanText(user.developer_type, 80).toLowerCase();
  const normalizedTags = tagNames.map((tag) => tag.toLowerCase());
  const hasTag = (patterns) => normalizedTags.some((tag) => patterns.some((pattern) => tag.includes(pattern)));

  if (config.adminUsernames.has(username) || hasTag(["管理员", "admin"])) {
    return { roleKey: "admin", discipline: "管理", title: tagTitle(tagNames, "管理员") };
  }
  if (hasTag(["制片", "策划", "项目"])) {
    return { roleKey: "producer", discipline: "项目", title: tagTitle(tagNames, "项目负责人") };
  }
  if (hasTag(["ui"])) {
    return { roleKey: "ui", discipline: "UI", title: tagTitle(tagNames, "UI") };
  }
  if (hasTag(["模型"])) {
    return { roleKey: "model", discipline: "模型", title: tagTitle(tagNames, "模型") };
  }
  if (hasTag(["动画"])) {
    return { roleKey: "animator", discipline: "动画", title: tagTitle(tagNames, "动画") };
  }
  if (developerType || hasTag(["开发", "程序", "unity", "cocos"])) {
    const title = tagNames.length ? tagNames.join(" / ") : `${developerType || "playable"}开发`;
    return { roleKey: "programmer", discipline: "研发", title };
  }
  if (hasTag(["音效", "sound"])) {
    return { roleKey: "artist", discipline: "音效", title: tagTitle(tagNames, "音效") };
  }
  return { roleKey: "artist", discipline: "美术", title: tagTitle(tagNames, "美术") };
}

function tagTitle(tagNames, fallback) {
  return tagNames.length ? tagNames.join(" / ") : fallback;
}

function createPeopleNameIndex(people) {
  const index = new Map();
  for (const person of people) {
    index.set(normalizeLookup(person.name), person.id);
    index.set(normalizeLookup(person.username), person.id);
  }
  return index;
}

function findPersonByName(index, value) {
  return index.get(normalizeLookup(value));
}

function buildDisciplineProgress(teamIds, peopleById, projectProgress) {
  const result = Object.fromEntries(disciplines.map((discipline) => [discipline, 0]));
  for (const personId of teamIds) {
    const discipline = peopleById.get(personId)?.discipline;
    if (disciplines.includes(discipline)) {
      result[discipline] = Math.max(result[discipline], projectProgress);
    }
  }
  return result;
}

function buildTenantNameOptions(tenants) {
  const baseCounts = tenants.reduce((counts, tenant) => {
    const base = cleanText(tenant.name, 160) || `客户 ${tenant.id}`;
    counts.set(base, (counts.get(base) ?? 0) + 1);
    return counts;
  }, new Map());
  const usedNames = new Set();

  return tenants.map((tenant) => {
    const baseName = cleanText(tenant.name, 160) || `客户 ${tenant.id}`;
    let name = baseName;
    if ((baseCounts.get(baseName) ?? 0) > 1 || usedNames.has(name)) {
      name = `${baseName} #${tenant.id}`;
    }
    usedNames.add(name);
    return {
      id: `ops-tenant-${tenant.id}`,
      name,
      source: "ops-tenant",
    };
  });
}

function addUserTags(map, userId, tags = []) {
  for (const tag of tags ?? []) {
    const name = cleanText(tag?.name, 120);
    if (name) addToSet(map, userId, name);
  }
}

function addToSet(map, key, value) {
  if (!value) return;
  const normalizedKey = String(key);
  if (!map.has(normalizedKey)) map.set(normalizedKey, new Set());
  map.get(normalizedKey).add(value);
}

function progressForStatus(status) {
  return (
    {
      未启动: 5,
      推进中: 55,
      待反馈: 78,
      已反馈: 88,
      已完成: 100,
      回收中: 35,
      客户暂停: 20,
    }[status] ?? 45
  );
}

function phaseForStatus(status) {
  return (
    {
      未启动: "排期",
      推进中: "制作",
      待反馈: "待反馈",
      已反馈: "反馈处理",
      已完成: "已完成",
      回收中: "回收",
      客户暂停: "暂停",
    }[status] ?? status
  );
}

function healthForStatus(status) {
  if (["已完成", "已反馈", "推进中"].includes(status)) return "green";
  if (["客户暂停", "回收中"].includes(status)) return "red";
  return "amber";
}

function dueDaysForStatus(status) {
  if (status === "已完成") return 0;
  if (status === "客户暂停") return -1;
  return 7;
}

function blockerForStatus(status) {
  if (status === "客户暂停") return "客户暂停";
  if (status === "回收中") return "项目回收中";
  return "无";
}

function toUserId(id) {
  return `ops-user-${id}`;
}

function toProjectId(id) {
  return `ops-project-${id}`;
}

function compareIds(a, b) {
  const numericA = Number(String(a).match(/\d+$/)?.[0] ?? 0);
  const numericB = Number(String(b).match(/\d+$/)?.[0] ?? 0);
  return numericB - numericA || String(a).localeCompare(String(b));
}

function cleanUsername(username, fallbackId) {
  const cleaned = cleanText(username, 80).replace(/\s+/g, "_");
  return cleaned || `ops_user_${fallbackId}`;
}

function cleanText(value, limit) {
  return String(value ?? "").trim().slice(0, limit);
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeLookup(value) {
  return cleanText(value, 160).toLowerCase().replace(/\s+/g, "");
}

function ensureTrailingSlash(value) {
  return String(value).endsWith("/") ? value : `${value}/`;
}
