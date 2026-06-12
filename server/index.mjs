import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import Database from "better-sqlite3";
import { people as seedPeople, projects as seedProjects, seedPassword, tickets as seedTickets } from "./seed-data.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const dataDir = process.env.COMPANYPLAN_DATA_DIR ?? join(repoRoot, "data");
const uploadDir = process.env.COMPANYPLAN_UPLOAD_DIR ?? join(dataDir, "uploads");
const databasePath = process.env.COMPANYPLAN_DB_PATH ?? join(dataDir, "companyplan.sqlite");
const sessionCookieName = "companyplan_session";
const sessionTtlDays = Number(process.env.COMPANYPLAN_SESSION_DAYS ?? "7");
const maxAttachmentBytes = Number(process.env.COMPANYPLAN_MAX_ATTACHMENT_BYTES ?? `${10 * 1024 * 1024}`);
const port = Number(process.env.PORT ?? "4174");
const statusOptions = new Set(["排队中", "进行中", "阻塞", "已完成"]);
const priorityOptions = new Set(["P0", "P1", "P2"]);
const attachmentKinds = new Set(["图片", "附件", "文件"]);

mkdirSync(dataDir, { recursive: true });
mkdirSync(uploadDir, { recursive: true });

const db = new Database(databasePath);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

initializeSchema();
seedDatabase();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "16mb" }));
app.use(securityHeaders);
app.use(validateWriteOrigin);

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    database: databasePath,
    uploadDir,
    startedAt: process.uptime(),
  });
});

app.post("/api/auth/login", (request, response) => {
  const username = String(request.body?.username ?? "").trim();
  const password = String(request.body?.password ?? "");
  const user = db.prepare("SELECT * FROM people WHERE username = ? AND disabled_at IS NULL").get(username);

  if (!user || !verifyPassword(password, user.password_hash)) {
    audit(null, "login_failed", "person", username || "unknown", request, { username });
    return response.status(401).json({ error: "用户名或密码不正确" });
  }

  const sessionId = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionTtlDays * 24 * 60 * 60 * 1000);
  db.prepare(
    "INSERT INTO sessions (id, person_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).run(sessionId, user.id, now.toISOString(), expiresAt.toISOString());

  audit(user.id, "login", "person", user.id, request);
  setSessionCookie(response, sessionId, expiresAt);
  response.json({ currentUser: mapPerson(user, getPersonProjectIds(user.id)) });
});

app.post("/api/auth/logout", attachSession, (request, response) => {
  if (request.sessionId) {
    db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?").run(new Date().toISOString(), request.sessionId);
    audit(request.user?.id ?? null, "logout", "session", request.sessionId, request);
  }
  clearSessionCookie(response);
  response.json({ ok: true });
});

app.get("/api/session", requireAuth, (request, response) => {
  response.json({ currentUser: request.user });
});

app.get("/api/bootstrap", requireAuth, (request, response) => {
  response.json(getBootstrap(request.user));
});

app.post("/api/tickets", requireAuth, (request, response) => {
  const payload = request.body ?? {};
  const visibleProjectIds = getVisibleProjectIds(request.user);

  if (!visibleProjectIds.includes(payload.projectId)) {
    return response.status(403).json({ error: "无权在该项目下创建提单" });
  }

  const owner = getPerson(payload.ownerId);
  if (!owner) {
    return response.status(400).json({ error: "负责人不存在" });
  }
  if (owner.discipline !== payload.discipline) {
    return response.status(400).json({ error: "负责人岗位与提单环节不匹配" });
  }

  const ticketId = nextTicketId();
  const now = new Date();
  const ticket = {
    id: ticketId,
    title: cleanText(payload.title, 120) || "未命名需求",
    sourceProjectName: cleanText(payload.sourceProjectName, 160) || null,
    projectId: String(payload.projectId),
    requesterId: request.user.id,
    ownerId: owner.id,
    discipline: String(payload.discipline),
    startAt: formatDateTime(now),
    status: "排队中",
    priority: priorityOptions.has(payload.priority) ? payload.priority : "P1",
    ageDays: 0,
    statusAgeDays: 0,
    dueInDays: clampNumber(payload.dueInDays, 1, 30, 3),
    timelineOffsetDays: 0,
    needType: cleanText(payload.needType, 80) || "资产补充",
    summary: cleanText(payload.summary, 2000) || "待补充说明",
    hyperlink: cleanText(payload.hyperlink, 500) || null,
    text: cleanText(payload.text, 500) || null,
  };

  const createTransaction = db.transaction(() => {
    db.prepare(
      `INSERT INTO tickets (
        id, title, source_project_name, project_id, requester_id, owner_id, discipline, start_at, status, priority,
        age_days, status_age_days, due_in_days, timeline_offset_days, need_type, summary, hyperlink, text,
        created_at, updated_at, status_updated_at
      ) VALUES (
        @id, @title, @sourceProjectName, @projectId, @requesterId, @ownerId, @discipline, @startAt, @status, @priority,
        @ageDays, @statusAgeDays, @dueInDays, @timelineOffsetDays, @needType, @summary, @hyperlink, @text,
        @createdAt, @updatedAt, @statusUpdatedAt
      )`
    ).run({
      ...ticket,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      statusUpdatedAt: now.toISOString(),
    });

    const attachments = Array.isArray(payload.attachments) ? payload.attachments.slice(0, 10) : [];
    for (const attachment of attachments) {
      storeAttachment(ticketId, attachment, request.user.id, request);
    }

    audit(request.user.id, "ticket_created", "ticket", ticketId, request, {
      projectId: ticket.projectId,
      ownerId: ticket.ownerId,
      attachmentCount: attachments.length,
    });
  });

  createTransaction();
  response.status(201).json({ ticket: getTicketById(ticketId) });
});

app.patch("/api/tickets/:ticketId/status", requireAuth, (request, response) => {
  const ticket = getTicketById(request.params.ticketId);
  if (!ticket) return response.status(404).json({ error: "提单不存在" });
  if (!canReadTicket(request.user, ticket)) return response.status(403).json({ error: "无权访问该提单" });
  if (!canMutateTicket(request.user, ticket)) return response.status(403).json({ error: "无权修改该提单状态" });

  const nextStatus = request.body?.status;
  if (!statusOptions.has(nextStatus)) return response.status(400).json({ error: "状态不合法" });

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE tickets
     SET status = ?, status_age_days = CASE WHEN status = ? THEN status_age_days ELSE 0 END, updated_at = ?, status_updated_at = ?
     WHERE id = ?`
  ).run(nextStatus, nextStatus, now, now, ticket.id);
  audit(request.user.id, "ticket_status_updated", "ticket", ticket.id, request, {
    from: ticket.status,
    to: nextStatus,
  });
  response.json({ ticket: getTicketById(ticket.id) });
});

app.patch("/api/tickets/:ticketId/timeline", requireAuth, (request, response) => {
  const ticket = getTicketById(request.params.ticketId);
  if (!ticket) return response.status(404).json({ error: "提单不存在" });
  if (request.user.roleKey !== "admin") return response.status(403).json({ error: "只有管理员可以调整甘特视觉时间线" });

  const offsetDays = clampNumber(request.body?.offsetDays, 0, 18, ticket.timelineOffsetDays ?? ticket.ageDays);
  db.prepare("UPDATE tickets SET timeline_offset_days = ?, updated_at = ? WHERE id = ?").run(
    offsetDays,
    new Date().toISOString(),
    ticket.id
  );
  audit(request.user.id, "ticket_timeline_moved", "ticket", ticket.id, request, {
    from: ticket.timelineOffsetDays ?? ticket.ageDays,
    to: offsetDays,
  });
  response.json({ ticket: getTicketById(ticket.id) });
});

app.get("/api/attachments/:attachmentId/download", requireAuth, (request, response) => {
  const attachment = db.prepare("SELECT * FROM attachments WHERE id = ?").get(request.params.attachmentId);
  if (!attachment) return response.status(404).json({ error: "附件不存在" });
  const ticket = getTicketById(attachment.ticket_id);
  if (!ticket || !canReadTicket(request.user, ticket)) return response.status(403).json({ error: "无权下载该附件" });
  if (!attachment.storage_path || !existsSync(attachment.storage_path)) {
    return response.status(404).json({ error: "附件文件未落盘" });
  }
  response.download(attachment.storage_path, attachment.name);
});

app.get("/api/audit", requireAuth, (request, response) => {
  if (request.user.roleKey !== "admin") return response.status(403).json({ error: "只有管理员可以查看审计日志" });
  const rows = db
    .prepare("SELECT * FROM audit_events ORDER BY id DESC LIMIT ?")
    .all(clampNumber(request.query.limit, 1, 200, 100));
  response.json({
    events: rows.map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      ip: row.ip,
      userAgent: row.user_agent,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
      createdAt: row.created_at,
    })),
  });
});

const distDir = join(repoRoot, "dist");
if (existsSync(distDir)) {
  app.use("/companyPlan", express.static(distDir, { extensions: ["html"], index: false }));
  app.use(express.static(distDir, { extensions: ["html"], index: false }));
  app.get(/^(?!\/api\/).*/, (_request, response) => {
    response.sendFile(join(distDir, "index.html"));
  });
}

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: "服务器内部错误" });
});

app.listen(port, () => {
  console.log(`companyPlan production server listening on http://127.0.0.1:${port}`);
});

function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role_key TEXT NOT NULL,
      title TEXT NOT NULL,
      discipline TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      completion INTEGER NOT NULL,
      disabled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      client TEXT NOT NULL,
      genre TEXT NOT NULL,
      channel TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES people(id),
      status TEXT NOT NULL,
      phase TEXT NOT NULL,
      health TEXT NOT NULL,
      progress INTEGER NOT NULL,
      due_in_days INTEGER NOT NULL,
      ticket_count INTEGER NOT NULL,
      open_ticket_count INTEGER NOT NULL,
      discipline_progress_json TEXT NOT NULL,
      blocker TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_team (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      PRIMARY KEY (project_id, person_id)
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_project_name TEXT,
      project_id TEXT NOT NULL REFERENCES projects(id),
      requester_id TEXT NOT NULL REFERENCES people(id),
      owner_id TEXT NOT NULL REFERENCES people(id),
      discipline TEXT NOT NULL,
      start_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('排队中', '进行中', '阻塞', '已完成')),
      priority TEXT NOT NULL CHECK(priority IN ('P0', 'P1', 'P2')),
      age_days INTEGER NOT NULL DEFAULT 0,
      status_age_days INTEGER NOT NULL DEFAULT 0,
      due_in_days INTEGER NOT NULL DEFAULT 3,
      timeline_offset_days INTEGER DEFAULT 0,
      need_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      hyperlink TEXT,
      text TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status_updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('图片', '附件', '文件')),
      mime_type TEXT,
      size_bytes INTEGER,
      size_label TEXT NOT NULL,
      storage_path TEXT,
      sha256 TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_requester ON tickets(requester_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_owner ON tickets(owner_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_person ON sessions(person_id);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);
  `);
}

function seedDatabase() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM people").get().count;
  if (count > 0) return;

  const insertAll = db.transaction(() => {
    const insertPerson = db.prepare(
      `INSERT INTO people (id, username, password_hash, name, role_key, title, discipline, capacity, completion)
       VALUES (@id, @username, @passwordHash, @name, @roleKey, @title, @discipline, @capacity, @completion)`
    );
    const insertProject = db.prepare(
      `INSERT INTO projects (
        id, name, client, genre, channel, owner_id, status, phase, health, progress, due_in_days,
        ticket_count, open_ticket_count, discipline_progress_json, blocker
      ) VALUES (
        @id, @name, @client, @genre, @channel, @ownerId, @status, @phase, @health, @progress, @dueInDays,
        @ticketCount, @openTicketCount, @disciplineProgressJson, @blocker
      )`
    );
    const insertTeam = db.prepare("INSERT INTO project_team (project_id, person_id) VALUES (?, ?)");
    const insertTicket = db.prepare(
      `INSERT INTO tickets (
        id, title, source_project_name, project_id, requester_id, owner_id, discipline, start_at, status, priority,
        age_days, status_age_days, due_in_days, timeline_offset_days, need_type, summary, hyperlink, text,
        created_at, updated_at, status_updated_at
      ) VALUES (
        @id, @title, @sourceProjectName, @projectId, @requesterId, @ownerId, @discipline, @startAt, @status, @priority,
        @ageDays, @statusAgeDays, @dueInDays, @timelineOffsetDays, @needType, @summary, @hyperlink, @text,
        @createdAt, @updatedAt, @statusUpdatedAt
      )`
    );

    for (const person of seedPeople) {
      insertPerson.run({ ...person, passwordHash: hashPassword(seedPassword) });
    }

    for (const project of seedProjects) {
      insertProject.run({
        ...project,
        ownerId: project.ownerId,
        dueInDays: project.dueInDays,
        ticketCount: project.ticketCount,
        openTicketCount: project.openTicketCount,
        disciplineProgressJson: JSON.stringify(project.disciplineProgress),
      });
      for (const personId of project.teamIds) {
        insertTeam.run(project.id, personId);
      }
    }

    const now = new Date().toISOString();
    for (const ticket of seedTickets) {
      insertTicket.run({
        ...ticket,
        sourceProjectName: ticket.sourceProjectName ?? null,
        timelineOffsetDays: ticket.timelineOffsetDays ?? ticket.ageDays,
        createdAt: now,
        updatedAt: now,
        statusUpdatedAt: now,
      });
      for (const attachment of ticket.attachments ?? []) {
        db.prepare(
          `INSERT INTO attachments (id, ticket_id, name, kind, mime_type, size_bytes, size_label, storage_path, sha256, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          crypto.randomUUID(),
          ticket.id,
          attachment.name,
          attachment.kind,
          null,
          null,
          attachment.size,
          null,
          null,
          now
        );
      }
    }

    audit(null, "database_seeded", "system", "companyplan", null, {
      people: seedPeople.length,
      projects: seedProjects.length,
      tickets: seedTickets.length,
    });
  });

  insertAll();
}

function attachSession(request, _response, next) {
  const cookies = parseCookies(request.headers.cookie ?? "");
  const sessionId = cookies[sessionCookieName];
  request.sessionId = sessionId;
  request.user = null;

  if (!sessionId) return next();

  const session = db
    .prepare(
      `SELECT sessions.*, people.*
       FROM sessions
       JOIN people ON people.id = sessions.person_id
       WHERE sessions.id = ? AND sessions.revoked_at IS NULL AND sessions.expires_at > ? AND people.disabled_at IS NULL`
    )
    .get(sessionId, new Date().toISOString());

  if (session) {
    request.user = mapPerson(session, getPersonProjectIds(session.person_id));
  }
  next();
}

function requireAuth(request, response, next) {
  attachSession(request, response, () => {
    if (!request.user) return response.status(401).json({ error: "请先登录" });
    next();
  });
}

function setSessionCookie(response, sessionId, expiresAt) {
  const secure = process.env.COMPANYPLAN_COOKIE_SECURE === "1";
  response.cookie(sessionCookieName, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    expires: expiresAt,
    path: "/",
  });
}

function clearSessionCookie(response) {
  response.clearCookie(sessionCookieName, { httpOnly: true, sameSite: "lax", path: "/" });
}

function parseCookies(header) {
  return Object.fromEntries(
    header
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        if (index === -1) return [item, ""];
        return [decodeURIComponent(item.slice(0, index)), decodeURIComponent(item.slice(index + 1))];
      })
  );
}

function securityHeaders(_request, response, next) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
}

function validateWriteOrigin(request, response, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return next();
  const origin = request.headers.origin;
  if (!origin) return next();

  const expected = `${request.protocol}://${request.get("host")}`;
  if (origin !== expected) return response.status(403).json({ error: "请求来源不合法" });
  next();
}

function getBootstrap(user) {
  const projects = getVisibleProjects(user);
  const projectIds = projects.map((project) => project.id);
  const people = getVisiblePeople(user, projectIds);
  const tickets = getVisibleTickets(user, projectIds);

  return {
    currentUser: user,
    people,
    projects,
    tickets,
  };
}

function getVisibleProjectIds(user) {
  if (user.roleKey === "admin") {
    return db.prepare("SELECT id FROM projects ORDER BY id").all().map((row) => row.id);
  }

  return db
    .prepare(
      `SELECT DISTINCT projects.id
       FROM projects
       LEFT JOIN project_team ON project_team.project_id = projects.id
       WHERE projects.owner_id = ? OR project_team.person_id = ?
       ORDER BY projects.id`
    )
    .all(user.id, user.id)
    .map((row) => row.id);
}

function getVisibleProjects(user) {
  const ids = getVisibleProjectIds(user);
  if (!ids.length) return [];
  const rows = db.prepare(`SELECT * FROM projects WHERE id IN (${placeholders(ids)}) ORDER BY id`).all(...ids);
  return rows.map(mapProject);
}

function getVisiblePeople(user, projectIds) {
  if (user.roleKey === "admin") {
    return db.prepare("SELECT * FROM people WHERE disabled_at IS NULL ORDER BY id").all().map((row) => mapPerson(row, getPersonProjectIds(row.id)));
  }

  const rows = db
    .prepare(
      `SELECT DISTINCT people.*
       FROM people
       LEFT JOIN project_team ON project_team.person_id = people.id
       WHERE people.disabled_at IS NULL AND (people.id = ? OR project_team.project_id IN (${placeholders(projectIds)}))
       ORDER BY people.id`
    )
    .all(user.id, ...projectIds);
  return rows.map((row) => mapPerson(row, getPersonProjectIds(row.id)));
}

function getVisibleTickets(user, visibleProjectIds = getVisibleProjectIds(user)) {
  const rows =
    user.roleKey === "admin"
      ? db.prepare("SELECT * FROM tickets ORDER BY created_at DESC, id DESC").all()
      : db
          .prepare(
            `SELECT DISTINCT *
             FROM tickets
             WHERE requester_id = ? OR owner_id = ? OR project_id IN (${placeholders(visibleProjectIds)})
             ORDER BY created_at DESC, id DESC`
          )
          .all(user.id, user.id, ...visibleProjectIds);
  return rows.map(mapTicket);
}

function getPerson(id) {
  const row = db.prepare("SELECT * FROM people WHERE id = ? AND disabled_at IS NULL").get(id);
  return row ? mapPerson(row, getPersonProjectIds(row.id)) : null;
}

function getPersonProjectIds(personId) {
  return db.prepare("SELECT project_id FROM project_team WHERE person_id = ? ORDER BY project_id").all(personId).map((row) => row.project_id);
}

function getTicketById(ticketId) {
  const row = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
  return row ? mapTicket(row) : null;
}

function canReadTicket(user, ticket) {
  if (user.roleKey === "admin") return true;
  return ticket.requesterId === user.id || ticket.ownerId === user.id || getVisibleProjectIds(user).includes(ticket.projectId);
}

function canMutateTicket(user, ticket) {
  return user.roleKey === "admin" || ticket.requesterId === user.id || ticket.ownerId === user.id;
}

function nextTicketId() {
  const date = new Date();
  const yymm = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `REQ-${yymm}-`;
  const row = db.prepare("SELECT id FROM tickets WHERE id LIKE ? ORDER BY id DESC LIMIT 1").get(`${prefix}%`);
  const next = row ? Number(row.id.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function storeAttachment(ticketId, attachment, actorId, request) {
  const name = cleanFilename(attachment?.name ?? "attachment.bin");
  const kind = attachmentKinds.has(attachment?.kind) ? attachment.kind : "附件";
  const mimeType = cleanText(attachment?.mimeType, 160) || null;
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  let storagePath = null;
  let sha256 = null;
  let sizeBytes = Number(attachment?.sizeBytes ?? 0) || null;
  let sizeLabel = cleanText(attachment?.size, 80) || "0 B";

  if (attachment?.dataBase64) {
    const data = Buffer.from(String(attachment.dataBase64), "base64");
    if (data.byteLength > maxAttachmentBytes) {
      throw new Error(`${name} exceeds max attachment size`);
    }
    const ticketUploadDir = join(uploadDir, ticketId);
    mkdirSync(ticketUploadDir, { recursive: true });
    storagePath = resolve(ticketUploadDir, `${id}-${name}`);
    if (!storagePath.startsWith(resolve(ticketUploadDir))) {
      throw new Error("Invalid attachment path");
    }
    writeFileSync(storagePath, data, { flag: "wx" });
    sha256 = crypto.createHash("sha256").update(data).digest("hex");
    sizeBytes = data.byteLength;
    sizeLabel = formatFileSize(data.byteLength);
  }

  db.prepare(
    `INSERT INTO attachments (id, ticket_id, name, kind, mime_type, size_bytes, size_label, storage_path, sha256, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, ticketId, name, kind, mimeType, sizeBytes, sizeLabel, storagePath, sha256, createdAt);

  audit(actorId, "attachment_uploaded", "attachment", id, request, {
    ticketId,
    name,
    kind,
    sizeBytes,
    sha256,
  });
}

function mapPerson(row, projectIds = []) {
  return {
    id: row.id,
    name: row.name,
    roleKey: row.role_key,
    title: row.title,
    discipline: row.discipline,
    capacity: row.capacity,
    completion: row.completion,
    projectIds,
  };
}

function mapProject(row) {
  const teamIds = db.prepare("SELECT person_id FROM project_team WHERE project_id = ? ORDER BY person_id").all(row.id).map((item) => item.person_id);
  return {
    id: row.id,
    name: row.name,
    client: row.client,
    genre: row.genre,
    channel: row.channel,
    ownerId: row.owner_id,
    status: row.status,
    phase: row.phase,
    health: row.health,
    progress: row.progress,
    dueInDays: row.due_in_days,
    ticketCount: row.ticket_count,
    openTicketCount: row.open_ticket_count,
    teamIds,
    disciplineProgress: JSON.parse(row.discipline_progress_json),
    blocker: row.blocker,
  };
}

function mapTicket(row) {
  const attachments = db.prepare("SELECT * FROM attachments WHERE ticket_id = ? ORDER BY created_at, id").all(row.id).map(mapAttachment);
  return {
    id: row.id,
    title: row.title,
    sourceProjectName: row.source_project_name ?? undefined,
    projectId: row.project_id,
    requesterId: row.requester_id,
    ownerId: row.owner_id,
    discipline: row.discipline,
    startAt: row.start_at,
    status: row.status,
    priority: row.priority,
    ageDays: row.age_days,
    statusAgeDays: row.status_age_days,
    dueInDays: row.due_in_days,
    timelineOffsetDays: row.timeline_offset_days,
    needType: row.need_type,
    summary: row.summary,
    hyperlink: row.hyperlink ?? undefined,
    text: row.text ?? undefined,
    attachments,
  };
}

function mapAttachment(row) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    size: row.size_label,
    mimeType: row.mime_type ?? undefined,
    downloadUrl: row.storage_path ? `/api/attachments/${row.id}/download` : undefined,
  };
}

function audit(actorId, action, entityType, entityId, request, metadata = null) {
  db.prepare(
    `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, ip, user_agent, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    actorId,
    action,
    entityType,
    String(entityId),
    request?.ip ?? null,
    request?.headers?.["user-agent"] ?? null,
    metadata ? JSON.stringify(metadata) : null,
    new Date().toISOString()
  );
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

function placeholders(values) {
  return values.length ? values.map(() => "?").join(",") : "NULL";
}

function cleanText(value, limit) {
  return String(value ?? "").trim().slice(0, limit);
}

function cleanFilename(value) {
  const base = normalize(String(value)).replace(/^(\.\.(\/|\\|$))+/, "").split(/[\\/]/).pop() || "attachment.bin";
  const safe = base.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_").slice(0, 180);
  return safe || `attachment${extname(base) || ".bin"}`;
}

function clampNumber(value, min, max, fallback) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Math.round(next)));
}

function formatDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
}
