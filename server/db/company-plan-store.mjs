import crypto from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { deflateRawSync, deflateSync } from "node:zlib";
import {
  people as seedPeople,
  projectNameOptions as seedProjectNameOptions,
  projects as seedProjects,
  seedPassword,
  ticketTypeSettings as seedTicketTypeSettings,
  tickets as seedTickets,
} from "../seed-data.mjs";
import {
  attachmentKinds,
  crc32Table,
  defaultDeliveryHours,
  defaultRiskWarningHours,
  maxAttachmentBytes,
  sessionCookieName,
  uploadDir,
} from "../config/runtime.mjs";

let db;

export function bindCompanyPlanStore(database) {
  db = database;
}

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
      project_name TEXT,
      project_id TEXT NOT NULL REFERENCES projects(id),
      requester_id TEXT NOT NULL REFERENCES people(id),
      owner_id TEXT NOT NULL REFERENCES people(id),
      discipline TEXT NOT NULL,
      start_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('排队中', '进行中', '阻塞', '已完成')),
      priority TEXT NOT NULL CHECK(priority IN ('紧急', '优先', '普通', '低优先')),
      age_days INTEGER NOT NULL DEFAULT 0,
      status_age_days INTEGER NOT NULL DEFAULT 0,
      due_in_days INTEGER NOT NULL DEFAULT 3,
      due_in_hours INTEGER NOT NULL DEFAULT 72,
      timeline_offset_days INTEGER DEFAULT 0,
      timeline_offset_hours INTEGER DEFAULT 0,
      timeline_span_hours INTEGER DEFAULT 72,
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

    CREATE TABLE IF NOT EXISTS project_name_options (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ticket_type_settings (
      type_key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      default_delivery_hours INTEGER NOT NULL,
      risk_warning_hours INTEGER NOT NULL DEFAULT 8,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_requester ON tickets(requester_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_owner ON tickets(owner_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_person ON sessions(person_id);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);
  `);
  migrateSchema();
}

function seedDatabase() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM people").get().count;
  if (count > 0) {
    seedConfigIfMissing();
    backfillStoredAttachments();
    return;
  }

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
        id, title, source_project_name, project_name, project_id, requester_id, owner_id, discipline, start_at, status, priority,
        age_days, status_age_days, due_in_days, due_in_hours, timeline_offset_days, timeline_offset_hours, timeline_span_hours,
        need_type, summary, hyperlink, text,
        created_at, updated_at, status_updated_at
      ) VALUES (
        @id, @title, @sourceProjectName, @projectName, @projectId, @requesterId, @ownerId, @discipline, @startAt, @status, @priority,
        @ageDays, @statusAgeDays, @dueInDays, @dueInHours, @timelineOffsetDays, @timelineOffsetHours, @timelineSpanHours,
        @needType, @summary, @hyperlink, @text,
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
    seedConfigRows(now);
    for (const ticket of seedTickets) {
      const dueInHours = ticket.dueInHours ?? Math.max(1, (ticket.dueInDays ?? 3) * 24);
      const timelineOffsetHours = ticket.timelineOffsetHours ?? Math.max(0, (ticket.timelineOffsetDays ?? ticket.ageDays ?? 0) * 24);
      insertTicket.run({
        ...ticket,
        sourceProjectName: ticket.sourceProjectName ?? null,
        projectName: ticket.projectName ?? ticket.sourceProjectName ?? null,
        dueInHours,
        timelineOffsetDays: ticket.timelineOffsetDays ?? ticket.ageDays,
        timelineOffsetHours,
        timelineSpanHours: ticket.timelineSpanHours ?? Math.max(4, dueInHours),
        createdAt: now,
        updatedAt: now,
        statusUpdatedAt: now,
      });
      for (const attachment of ticket.attachments ?? []) {
        const id = crypto.randomUUID();
        const storedAttachment = materializeAttachmentFile(ticket.id, attachment, id);
        db.prepare(
          `INSERT INTO attachments (id, ticket_id, name, kind, mime_type, size_bytes, size_label, storage_path, sha256, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          ticket.id,
          storedAttachment.name,
          storedAttachment.kind,
          storedAttachment.mimeType,
          storedAttachment.sizeBytes,
          storedAttachment.sizeLabel,
          storedAttachment.storagePath,
          storedAttachment.sha256,
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
  backfillStoredAttachments();
}

function migrateSchema() {
  ensureColumn("tickets", "project_name", "TEXT");
  ensureColumn("tickets", "due_in_hours", "INTEGER NOT NULL DEFAULT 72");
  ensureColumn("tickets", "timeline_offset_hours", "INTEGER DEFAULT 0");
  ensureColumn("tickets", "timeline_span_hours", "INTEGER DEFAULT 72");

  db.prepare(
    "UPDATE tickets SET project_name = source_project_name WHERE (project_name IS NULL OR trim(project_name) = '') AND source_project_name IS NOT NULL"
  ).run();

  db.prepare(
    "UPDATE tickets SET due_in_hours = due_in_days * 24 WHERE due_in_hours = 72 AND due_in_days > 0 AND due_in_days != 3"
  ).run();
  db.prepare(
    "UPDATE tickets SET timeline_offset_hours = COALESCE(timeline_offset_days, age_days, 0) * 24 WHERE timeline_offset_hours IS NULL OR timeline_offset_hours = 0"
  ).run();
  db.prepare(
    "UPDATE tickets SET timeline_span_hours = MAX(4, due_in_hours) WHERE timeline_span_hours IS NULL"
  ).run();

  const ticketSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tickets'").get()?.sql ?? "";
  if (ticketSchema.includes("'P0'") || ticketSchema.includes("'P1'") || ticketSchema.includes("'P2'")) {
    rebuildTicketsForChinesePriorities();
  } else {
    db.prepare(
      `UPDATE tickets
       SET priority = CASE priority
         WHEN 'P0' THEN '紧急'
         WHEN 'P1' THEN '优先'
         WHEN 'P2' THEN '普通'
         ELSE priority
       END`
    ).run();
  }

  repairAttachmentForeignKey();
}

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
  if (!columns.includes(columnName)) {
    db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
  }
}

function rebuildTicketsForChinesePriorities() {
  db.pragma("foreign_keys = OFF");
  try {
    db.exec(`
      DROP TABLE IF EXISTS tickets_next;
      ALTER TABLE tickets RENAME TO tickets_old;

      CREATE TABLE tickets (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        source_project_name TEXT,
        project_name TEXT,
        project_id TEXT NOT NULL REFERENCES projects(id),
        requester_id TEXT NOT NULL REFERENCES people(id),
        owner_id TEXT NOT NULL REFERENCES people(id),
        discipline TEXT NOT NULL,
        start_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('排队中', '进行中', '阻塞', '已完成')),
        priority TEXT NOT NULL CHECK(priority IN ('紧急', '优先', '普通', '低优先')),
        age_days INTEGER NOT NULL DEFAULT 0,
        status_age_days INTEGER NOT NULL DEFAULT 0,
        due_in_days INTEGER NOT NULL DEFAULT 3,
        due_in_hours INTEGER NOT NULL DEFAULT 72,
        timeline_offset_days INTEGER DEFAULT 0,
        timeline_offset_hours INTEGER DEFAULT 0,
        timeline_span_hours INTEGER DEFAULT 72,
        need_type TEXT NOT NULL,
        summary TEXT NOT NULL,
        hyperlink TEXT,
        text TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        status_updated_at TEXT NOT NULL
      );

      INSERT INTO tickets (
        id, title, source_project_name, project_name, project_id, requester_id, owner_id, discipline, start_at, status, priority,
        age_days, status_age_days, due_in_days, due_in_hours, timeline_offset_days, timeline_offset_hours, timeline_span_hours,
        need_type, summary, hyperlink, text, created_at, updated_at, status_updated_at
      )
      SELECT
        id, title, source_project_name, project_name, project_id, requester_id, owner_id, discipline, start_at, status,
        CASE priority
          WHEN 'P0' THEN '紧急'
          WHEN 'P1' THEN '优先'
          WHEN 'P2' THEN '普通'
          WHEN '低优先' THEN '低优先'
          WHEN '普通' THEN '普通'
          WHEN '优先' THEN '优先'
          WHEN '紧急' THEN '紧急'
          ELSE '普通'
        END,
        age_days, status_age_days, due_in_days, due_in_hours, timeline_offset_days, timeline_offset_hours, timeline_span_hours,
        need_type, summary, hyperlink, text, created_at, updated_at, status_updated_at
      FROM tickets_old;

      DROP TABLE tickets_old;
      CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_requester ON tickets(requester_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_owner ON tickets(owner_id);
    `);
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

function repairAttachmentForeignKey() {
  const foreignKeys = db.prepare("PRAGMA foreign_key_list(attachments)").all();
  if (!foreignKeys.every((item) => item.table === "tickets")) {
    db.pragma("foreign_keys = OFF");
    try {
      db.exec(`
        DROP TABLE IF EXISTS attachments_next;
        CREATE TABLE attachments_next (
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

        INSERT INTO attachments_next (
          id, ticket_id, name, kind, mime_type, size_bytes, size_label, storage_path, sha256, created_at
        )
        SELECT id, ticket_id, name, kind, mime_type, size_bytes, size_label, storage_path, sha256, created_at
        FROM attachments;

        DROP TABLE attachments;
        ALTER TABLE attachments_next RENAME TO attachments;
      `);
    } finally {
      db.pragma("foreign_keys = ON");
    }
  }

  const violations = db.prepare("PRAGMA foreign_key_check").all();
  if (violations.length) {
    throw new Error(`Migration left ${violations.length} foreign key violation(s)`);
  }
}

function seedConfigIfMissing() {
  const now = new Date().toISOString();
  const insertDefaults = db.transaction(() => {
    seedConfigRows(now);
  });
  insertDefaults();
}

function seedConfigRows(now) {
  const projectNameCount = db.prepare("SELECT COUNT(*) AS count FROM project_name_options").get().count;
  if (projectNameCount === 0) {
    const insertProjectName = db.prepare(
      `INSERT INTO project_name_options (id, name, is_active, sort_order, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?, ?)`
    );
    seedProjectNameOptions.forEach((option, index) => {
      insertProjectName.run(option.id, option.name, index, now, now);
    });
  }

  const insertType = db.prepare(
    `INSERT OR IGNORE INTO ticket_type_settings (
      type_key, label, default_delivery_hours, risk_warning_hours, is_active, sort_order, updated_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?)`
  );
  seedTicketTypeSettings.forEach((setting, index) => {
    insertType.run(
      setting.typeKey,
      setting.label,
      setting.defaultDeliveryHours,
      setting.riskWarningHours ?? defaultRiskWarningHours,
      index,
      now
    );
  });
}

function getBootstrap(user) {
  const projects = getVisibleProjects(user);
  const projectIds = projects.map((project) => project.id);
  const tickets = getVisibleTickets(user);
  const ticketPersonIds = Array.from(new Set(tickets.flatMap((ticket) => [ticket.requesterId, ticket.ownerId])));
  const people = getVisiblePeople(user, projectIds, ticketPersonIds);
  const config = getCompanyConfig();

  return {
    currentUser: user,
    people,
    projects,
    tickets,
    config,
  };
}

function getCompanyConfig() {
  return {
    projectNameOptions: db
      .prepare("SELECT * FROM project_name_options WHERE is_active = 1 ORDER BY sort_order, name")
      .all()
      .map((row) => ({
        id: row.id,
        name: row.name,
      })),
    ticketTypeSettings: db
      .prepare("SELECT * FROM ticket_type_settings WHERE is_active = 1 ORDER BY sort_order, label")
      .all()
      .map((row) => ({
        typeKey: row.type_key,
        label: row.label,
        defaultDeliveryHours: row.default_delivery_hours,
        riskWarningHours: row.risk_warning_hours,
      })),
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

function getVisiblePeople(user, projectIds, ticketPersonIds = []) {
  if (user.roleKey === "admin") {
    return db.prepare("SELECT * FROM people WHERE disabled_at IS NULL ORDER BY id").all().map((row) => mapPerson(row, getPersonProjectIds(row.id)));
  }

  const allowedPersonIds = Array.from(new Set([user.id, ...ticketPersonIds]));
  const rows = db
    .prepare(
      `SELECT DISTINCT people.*
       FROM people
       LEFT JOIN project_team ON project_team.person_id = people.id
       WHERE people.disabled_at IS NULL
         AND (
           people.id IN (${placeholders(allowedPersonIds)})
           OR project_team.project_id IN (${placeholders(projectIds)})
         )
       ORDER BY people.id`
    )
    .all(...allowedPersonIds, ...projectIds);
  return rows.map((row) => mapPerson(row, getPersonProjectIds(row.id)));
}

function getVisibleTickets(user) {
  let rows;
  if (user.roleKey === "admin") {
    rows = db.prepare("SELECT * FROM tickets ORDER BY created_at DESC, id DESC").all();
  } else {
    rows = db
      .prepare(
        `SELECT DISTINCT *
         FROM tickets
         WHERE requester_id = ? OR owner_id = ?
         ORDER BY created_at DESC, id DESC`
      )
      .all(user.id, user.id);
  }
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
  return ticket.requesterId === user.id || ticket.ownerId === user.id;
}

function canMutateTicket(user, ticket) {
  return user.roleKey === "admin" || ticket.requesterId === user.id || ticket.ownerId === user.id;
}

function getDefaultDeliveryHours(typeKey) {
  const row = db.prepare("SELECT default_delivery_hours FROM ticket_type_settings WHERE type_key = ?").get(typeKey);
  return row ? row.default_delivery_hours : defaultDeliveryHours;
}

function isConfiguredProjectName(name) {
  return Boolean(db.prepare("SELECT 1 FROM project_name_options WHERE name = ? AND is_active = 1").get(name));
}

function getRiskWarningHours(typeKey) {
  const row = db.prepare("SELECT risk_warning_hours FROM ticket_type_settings WHERE type_key = ?").get(typeKey);
  return row ? row.risk_warning_hours : defaultRiskWarningHours;
}

function backfillStoredAttachments() {
  const rows = db.prepare("SELECT * FROM attachments ORDER BY created_at, id").all();
  const updateAttachment = db.prepare(
    `UPDATE attachments
     SET name = ?, kind = ?, mime_type = ?, size_bytes = ?, size_label = ?, storage_path = ?, sha256 = ?
     WHERE id = ?`
  );
  const backfill = db.transaction(() => {
    for (const row of rows) {
      if (row.storage_path && existsSync(row.storage_path)) continue;
      const storedAttachment = materializeAttachmentFile(row.ticket_id, row, row.id);
      updateAttachment.run(
        storedAttachment.name,
        storedAttachment.kind,
        storedAttachment.mimeType,
        storedAttachment.sizeBytes,
        storedAttachment.sizeLabel,
        storedAttachment.storagePath,
        storedAttachment.sha256,
        row.id
      );
    }
  });
  backfill();
}

function materializeAttachmentFile(ticketId, attachment, id) {
  const name = cleanFilename(attachment?.name ?? "attachment.bin");
  const kind = attachmentKinds.has(attachment?.kind) ? attachment.kind : "附件";
  const data = attachment?.dataBase64
    ? Buffer.from(String(attachment.dataBase64), "base64")
    : createDemoAttachmentData(ticketId, name, kind);

  if (data.byteLength > maxAttachmentBytes) {
    throw new Error(`${name} exceeds max attachment size`);
  }

  const ticketUploadDir = join(uploadDir, ticketId);
  mkdirSync(ticketUploadDir, { recursive: true });
  const resolvedUploadDir = resolve(ticketUploadDir);
  const storagePath = resolve(ticketUploadDir, `${id}-${name}`);
  if (storagePath !== resolvedUploadDir && !storagePath.startsWith(`${resolvedUploadDir}${sep}`)) {
    throw new Error("Invalid attachment path");
  }

  writeFileSync(storagePath, data);
  return {
    name,
    kind,
    mimeType: cleanText(attachment?.mimeType, 160) || inferMimeType(name, kind),
    sizeBytes: data.byteLength,
    sizeLabel: formatFileSize(data.byteLength),
    storagePath,
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
  };
}

function createDemoAttachmentData(ticketId, name, kind) {
  const extension = extname(name).toLowerCase();
  const label = `${ticketId} / ${name}`;
  if (kind === "图片" || [".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    return createDemoPng(label);
  }
  if (extension === ".xlsx") {
    return createDemoXlsx(ticketId, name);
  }
  if (extension === ".zip") {
    return createZip([
      {
        name: "README.txt",
        data: Buffer.from(`companyPlan demo package\nTicket: ${ticketId}\nAttachment: ${name}\n`, "utf8"),
      },
      {
        name: "asset-note.txt",
        data: Buffer.from("This placeholder package is intentionally browsable for QA checks.\n", "utf8"),
      },
    ]);
  }
  if (extension === ".wav") {
    return createDemoWav();
  }
  if (extension === ".fig") {
    return Buffer.from(JSON.stringify({ source: "companyPlan", ticketId, attachment: name, layers: [] }, null, 2), "utf8");
  }
  return Buffer.from(`companyPlan demo attachment\nTicket: ${ticketId}\nAttachment: ${name}\n`, "utf8");
}

function inferMimeType(name, kind) {
  const extension = extname(name).toLowerCase();
  if (kind === "图片" || extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (extension === ".zip") return "application/zip";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".fig" || extension === ".json") return "application/json";
  if (extension === ".txt" || extension === ".md") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function createDemoPng(label) {
  const width = 96;
  const height = 54;
  const seed = crc32(Buffer.from(label));
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 3 + 1);
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 3;
      raw[pixelOffset] = (seed + x * 3 + y * 5) & 0xff;
      raw[pixelOffset + 1] = ((seed >>> 8) + x * 7 + y * 2) & 0xff;
      raw[pixelOffset + 2] = ((seed >>> 16) + x * 2 + y * 9) & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createDemoXlsx(ticketId, name) {
  const escapedTicketId = escapeXml(ticketId);
  const escapedName = escapeXml(name);
  return createZip([
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="需求附件" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>Ticket</t></is></c><c r="B1" t="inlineStr"><is><t>${escapedTicketId}</t></is></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>Attachment</t></is></c><c r="B2" t="inlineStr"><is><t>${escapedName}</t></is></c></row>
  </sheetData>
</worksheet>`,
    },
  ]);
}

function createDemoWav() {
  const sampleRate = 8000;
  const durationSeconds = 0.35;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 9000);
    buffer.writeInt16LE(sample, 44 + index * 2);
  }
  return buffer;
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), "utf8");
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const timeDate = dosTimeDate(new Date("2026-06-01T00:00:00Z"));

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(timeDate.time, 10);
    localHeader.writeUInt16LE(timeDate.date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(timeDate.time, 12);
    centralHeader.writeUInt16LE(timeDate.date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function dosTimeDate(date) {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const ageHours = getElapsedHours(row.start_at);
  const statusAgeHours = getElapsedHours(row.status_updated_at);
  const dueInHours = Number(row.due_in_hours ?? defaultDeliveryHours);
  const remainingHours = row.status === "已完成" ? 0 : dueInHours - ageHours;
  const riskWarningHours = getRiskWarningHours(row.discipline);
  const timelineOffsetHours = Number(row.timeline_offset_hours ?? (row.timeline_offset_days ?? row.age_days ?? 0) * 24);
  const timelineSpanHours = Number(row.timeline_span_hours ?? dueInHours);
  return {
    id: row.id,
    title: row.title,
    sourceProjectName: row.source_project_name ?? undefined,
    projectName: row.project_name ?? undefined,
    projectId: row.project_id,
    requesterId: row.requester_id,
    ownerId: row.owner_id,
    discipline: row.discipline,
    startAt: row.start_at,
    status: row.status,
    priority: row.priority,
    ageDays: Math.floor(ageHours / 24),
    statusAgeDays: Math.floor(statusAgeHours / 24),
    dueInDays: Math.ceil(remainingHours / 24),
    ageHours,
    statusAgeHours,
    dueInHours,
    remainingHours,
    riskWarningHours,
    timelineOffsetDays: row.timeline_offset_days,
    timelineOffsetHours,
    timelineSpanHours,
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
    openUrl: row.storage_path ? `/api/attachments/${row.id}/open` : undefined,
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

function getElapsedHours(value) {
  const date = parseDateTime(value);
  if (!date) return 0;
  const diff = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diff / (60 * 60 * 1000)));
}

function parseDateTime(value) {
  if (!value) return null;
  const normalized = String(value).replace(/\//g, "-");
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
}

export {
  audit,
  canMutateTicket,
  canReadTicket,
  cleanText,
  clampNumber,
  formatDateTime,
  getBootstrap,
  getCompanyConfig,
  getDefaultDeliveryHours,
  getPerson,
  getPersonProjectIds,
  getTicketById,
  getVisibleProjectIds,
  initializeSchema,
  isConfiguredProjectName,
  mapPerson,
  nextTicketId,
  seedDatabase,
  storeAttachment,
  verifyPassword,
};
