import crypto from "node:crypto";
import dayjs from "dayjs";
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
  opsIntegration,
  sessionCookieName,
  uploadDir,
} from "../config/runtime.mjs";

let db;

export function bindCompanyPlanStore(database) {
  db = database;
}

async function initializeSchema() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(80) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(120) NOT NULL,
      role_key VARCHAR(40) NOT NULL,
      title VARCHAR(120) NOT NULL,
      discipline VARCHAR(80) NOT NULL,
      capacity INT NOT NULL,
      completion INT NOT NULL,
      disabled_at VARCHAR(40)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS projects (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      client VARCHAR(160) NOT NULL,
      genre VARCHAR(120) NOT NULL,
      channel VARCHAR(120) NOT NULL,
      owner_id VARCHAR(64) NOT NULL,
      status VARCHAR(80) NOT NULL,
      phase VARCHAR(80) NOT NULL,
      health VARCHAR(80) NOT NULL,
      progress INT NOT NULL,
      due_in_days INT NOT NULL,
      ticket_count INT NOT NULL,
      open_ticket_count INT NOT NULL,
      discipline_progress_json TEXT NOT NULL,
      blocker TEXT NOT NULL,
      CONSTRAINT fk_projects_owner FOREIGN KEY (owner_id) REFERENCES people(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS project_team (
      project_id VARCHAR(64) NOT NULL,
      person_id VARCHAR(64) NOT NULL,
      PRIMARY KEY (project_id, person_id),
      CONSTRAINT fk_project_team_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_project_team_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS tickets (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(160) NOT NULL,
      source_project_name VARCHAR(160),
      project_name VARCHAR(160),
      project_id VARCHAR(64) NOT NULL,
      requester_id VARCHAR(64) NOT NULL,
      owner_id VARCHAR(64) NOT NULL,
      discipline VARCHAR(80) NOT NULL,
      start_at VARCHAR(40) NOT NULL,
      status VARCHAR(20) NOT NULL CHECK(status IN ('排队中', '进行中', '阻塞', '已完成')),
      priority VARCHAR(20) NOT NULL CHECK(priority IN ('紧急', '优先', '普通', '低优先')),
      age_days INT NOT NULL DEFAULT 0,
      status_age_days INT NOT NULL DEFAULT 0,
      due_in_days INT NOT NULL DEFAULT 3,
      due_in_hours INT NOT NULL DEFAULT 72,
      timeline_offset_days INT DEFAULT 0,
      timeline_offset_hours INT DEFAULT 0,
      timeline_span_hours INT DEFAULT 72,
      need_type VARCHAR(120) NOT NULL,
      summary TEXT NOT NULL,
      hyperlink VARCHAR(500),
      text TEXT,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      status_updated_at VARCHAR(40) NOT NULL,
      CONSTRAINT fk_tickets_project FOREIGN KEY (project_id) REFERENCES projects(id),
      CONSTRAINT fk_tickets_requester FOREIGN KEY (requester_id) REFERENCES people(id),
      CONSTRAINT fk_tickets_owner FOREIGN KEY (owner_id) REFERENCES people(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS attachments (
      id VARCHAR(64) PRIMARY KEY,
      ticket_id VARCHAR(64) NOT NULL,
      name VARCHAR(200) NOT NULL,
      kind VARCHAR(20) NOT NULL CHECK(kind IN ('图片', '附件', '文件')),
      mime_type VARCHAR(160),
      size_bytes BIGINT,
      size_label VARCHAR(80) NOT NULL,
      storage_path TEXT,
      sha256 VARCHAR(64),
      created_at VARCHAR(40) NOT NULL,
      CONSTRAINT fk_attachments_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(128) PRIMARY KEY,
      person_id VARCHAR(64) NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      expires_at VARCHAR(40) NOT NULL,
      revoked_at VARCHAR(40),
      CONSTRAINT fk_sessions_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS audit_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      actor_id VARCHAR(64),
      action VARCHAR(80) NOT NULL,
      entity_type VARCHAR(80) NOT NULL,
      entity_id VARCHAR(128) NOT NULL,
      ip VARCHAR(80),
      user_agent TEXT,
      metadata_json TEXT,
      created_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS project_name_options (
      id VARCHAR(80) PRIMARY KEY,
      name VARCHAR(160) NOT NULL UNIQUE,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS ticket_type_settings (
      type_key VARCHAR(80) PRIMARY KEY,
      label VARCHAR(120) NOT NULL,
      default_delivery_hours INT NOT NULL,
      risk_warning_hours INT NOT NULL DEFAULT 8,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      updated_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- Phase 1:环节 = soyoo 标签(同步写 name/color;后台只配交付/阈值,同步不覆盖这几列)
    CREATE TABLE IF NOT EXISTS tags (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      color VARCHAR(40) NOT NULL DEFAULT '',
      default_delivery_hours INT NOT NULL DEFAULT 72,
      risk_warning_hours INT NOT NULL DEFAULT 8,
      sort_order INT NOT NULL DEFAULT 0,
      updated_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- 客户(tenant):供建单「所属项目」下拉
    CREATE TABLE IF NOT EXISTS tenants (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      updated_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- 项目-成员-标签 映射(核心:按 项目+标签 找负责人)
    CREATE TABLE IF NOT EXISTS project_member_tags (
      project_id VARCHAR(64) NOT NULL,
      person_id VARCHAR(64) NOT NULL,
      tag_id VARCHAR(64) NOT NULL,
      PRIMARY KEY (project_id, person_id, tag_id),
      KEY idx_pmt_project_tag (project_id, tag_id),
      CONSTRAINT fk_pmt_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_pmt_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- ops 环节(分类):ops 自己定义,交付/阈值配置挂这里;通过 ops_segment_tags 绑定若干 soyoo 标签
    CREATE TABLE IF NOT EXISTS ops_segments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL UNIQUE,
      default_delivery_hours INT NOT NULL DEFAULT 72,
      risk_warning_hours INT NOT NULL DEFAULT 8,
      sort_order INT NOT NULL DEFAULT 0,
      updated_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- 环节 ↔ soyoo 标签 绑定(程序 ← cocos开发 / unity开发 / 程序 …)
    CREATE TABLE IF NOT EXISTS ops_segment_tags (
      segment_id INT NOT NULL,
      tag_id VARCHAR(64) NOT NULL,
      PRIMARY KEY (segment_id, tag_id),
      KEY idx_ost_tag (tag_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- 提单流转记录(建单/开始/阻塞/完成/重开 每次记一条)
    CREATE TABLE IF NOT EXISTS ticket_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ticket_id VARCHAR(64) NOT NULL,
      actor_id VARCHAR(64),
      actor_name VARCHAR(120),
      action VARCHAR(40) NOT NULL,
      from_status VARCHAR(20),
      to_status VARCHAR(20),
      note VARCHAR(500),
      created_at VARCHAR(40) NOT NULL,
      KEY idx_te_ticket (ticket_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await ensureIndex("idx_tickets_project", "tickets", "project_id");
  await ensureIndex("idx_tickets_requester", "tickets", "requester_id");
  await ensureIndex("idx_tickets_owner", "tickets", "owner_id");
  await ensureIndex("idx_sessions_person", "sessions", "person_id");
  await ensureIndex("idx_audit_entity", "audit_events", "entity_type, entity_id");
  await migrateSchema();
  await seedDefaultSegments();
}

async function seedDatabase() {
  const count = (await db.prepare("SELECT COUNT(*) AS count FROM people").get()).count;
  if (count > 0) {
    await seedConfigIfMissing();
    await backfillStoredAttachments();
    return;
  }

  await db.transaction(async () => {
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
      await insertPerson.run({ ...person, passwordHash: hashPassword(seedPassword) });
    }

    for (const project of seedProjects) {
      await insertProject.run({
        ...project,
        ownerId: project.ownerId,
        dueInDays: project.dueInDays,
        ticketCount: project.ticketCount,
        openTicketCount: project.openTicketCount,
        disciplineProgressJson: JSON.stringify(project.disciplineProgress),
      });
      for (const personId of project.teamIds) {
        await insertTeam.run(project.id, personId);
      }
    }

    const now = new Date().toISOString();
    await seedConfigRows(now);
    for (const ticket of seedTickets) {
      const dueInHours = ticket.dueInHours ?? Math.max(1, (ticket.dueInDays ?? 3) * 24);
      const timelineOffsetHours = ticket.timelineOffsetHours ?? Math.max(0, (ticket.timelineOffsetDays ?? ticket.ageDays ?? 0) * 24);
      await insertTicket.run({
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
        await db.prepare(
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

    await audit(null, "database_seeded", "system", "companyplan", null, {
      people: seedPeople.length,
      projects: seedProjects.length,
      tickets: seedTickets.length,
    });
  });
  await backfillStoredAttachments();
}

// 删外键(若存在):本系统不强制 FK,表间用 id join。MySQL 无 DROP FK IF EXISTS,先查 information_schema。
async function dropForeignKeyIfExists(tableName, fkName) {
  const rows = await db
    .prepare(
      "SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'"
    )
    .all(tableName, fkName);
  if (rows.length) {
    await db.prepare(`ALTER TABLE ${safeIdentifier(tableName)} DROP FOREIGN KEY ${safeIdentifier(fkName)}`).run();
  }
}

async function migrateSchema() {
  await ensureColumn("tickets", "project_name", "VARCHAR(160)");
  await ensureColumn("tickets", "due_in_hours", "INT NOT NULL DEFAULT 72");
  await ensureColumn("tickets", "timeline_offset_hours", "INT DEFAULT 0");
  await ensureColumn("tickets", "timeline_span_hours", "INT DEFAULT 72");

  await db.prepare(
    "UPDATE tickets SET project_name = source_project_name WHERE (project_name IS NULL OR trim(project_name) = '') AND source_project_name IS NOT NULL"
  ).run();

  await db.prepare(
    "UPDATE tickets SET due_in_hours = due_in_days * 24 WHERE due_in_hours = 72 AND due_in_days > 0 AND due_in_days != 3"
  ).run();
  await db.prepare(
    "UPDATE tickets SET timeline_offset_hours = COALESCE(timeline_offset_days, age_days, 0) * 24 WHERE timeline_offset_hours IS NULL OR timeline_offset_hours = 0"
  ).run();
  await db.prepare(
    "UPDATE tickets SET timeline_span_hours = GREATEST(4, due_in_hours) WHERE timeline_span_hours IS NULL"
  ).run();

  await db.prepare(
    `UPDATE tickets
     SET priority = CASE priority
       WHEN 'P0' THEN '紧急'
       WHEN 'P1' THEN '优先'
       WHEN 'P2' THEN '普通'
       ELSE priority
     END`
  ).run();

  // Phase 1:环节 = soyoo 标签 对接 —— 新列(只增不删)
  await ensureColumn("projects", "tenant_id", "VARCHAR(64) NOT NULL DEFAULT ''");
  await ensureColumn("projects", "planner_name", "VARCHAR(255) NOT NULL DEFAULT ''");
  await ensureColumn("projects", "developer_name", "VARCHAR(255) NOT NULL DEFAULT ''");
  await ensureColumn("tickets", "tag_id", "VARCHAR(64) NOT NULL DEFAULT ''");
  await ensureColumn("tickets", "block_reason", "VARCHAR(500)");
  await ensureColumn("tickets", "risk_warning_hours", "INT NOT NULL DEFAULT 8");
  // 富文本正文(可含内联 base64 图片,故用 MEDIUMTEXT 16MB);summary 仍存纯文本摘要供列表/搜索
  await ensureColumn("tickets", "content_html", "MEDIUMTEXT");
  // 工单关联环节 id:显示「环节」按 id 取当前名(改名即时生效);discipline 仅作历史快照回退
  await ensureColumn("tickets", "segment_id", "INT");
  // 存量工单按环节名回填 segment_id(改过名的孤儿匹配不上则保持 NULL,回退 discipline)
  await db.prepare("UPDATE tickets t JOIN ops_segments s ON s.name = t.discipline SET t.segment_id = s.id WHERE t.segment_id IS NULL").run();
  // 微信名称/头像(同步自 soyoo /ops/users,供负责人下拉显示 头像｜网名｜姓名)
  await ensureColumn("people", "wechat_name", "VARCHAR(191)");
  await ensureColumn("people", "wechat_avatar", "VARCHAR(1024)");
  // 弃用字段加注释(保留不删):
  await ensureColumnComment("tickets", "discipline", "VARCHAR(80) NOT NULL", "弃用:改用 tag_id;新单仍写标签名兼容历史");
  await ensureColumnComment("people", "discipline", "VARCHAR(80) NOT NULL", "弃用:全局岗位;改用 project_member_tags 解析负责人");

  // ===== ops 提单去同步:工单全量快照 + 去外键 + 变更游标(soyoo 数据不再落 people/projects)=====
  // 快照列:建单时把 soyoo 返回的字段都存进工单,显示只读本地,不再 join people/projects
  await ensureColumn("tickets", "client_id", "VARCHAR(64) NOT NULL DEFAULT ''");
  await ensureColumn("tickets", "client_name", "VARCHAR(160)");
  await ensureColumn("tickets", "project_status", "VARCHAR(80)");
  await ensureColumn("tickets", "owner_name", "VARCHAR(120)");
  await ensureColumn("tickets", "owner_avatar", "VARCHAR(1024)");
  await ensureColumn("tickets", "owner_username", "VARCHAR(120)");
  await ensureColumn("tickets", "requester_name", "VARCHAR(120)");
  await ensureColumn("tickets", "requester_avatar", "VARCHAR(1024)");
  await ensureColumn("tickets", "requester_username", "VARCHAR(120)");
  await ensureColumn("tickets", "tag_name", "VARCHAR(120)");
  await ensureColumn("tickets", "due_at", "VARCHAR(40)"); // 截止时刻(=创建+交付时长):延期 tab 服务端筛/排序用
  await ensureColumn("tickets", "warn_at", "VARCHAR(40)"); // 预警时刻(=截止−预警窗口)
  await ensureIndex("idx_tickets_warn", "tickets", "warn_at");

  // 一次性 backfill 旧工单快照(此时 people/projects/tenants 仍在;删表前补齐;表已删则忽略)
  try {
    await db.prepare(`UPDATE tickets t JOIN people o ON o.id = t.owner_id
      SET t.owner_name = COALESCE(NULLIF(t.owner_name, ''), o.name),
          t.owner_avatar = COALESCE(t.owner_avatar, o.wechat_avatar),
          t.owner_username = COALESCE(NULLIF(t.owner_username, ''), o.username)
      WHERE t.owner_name IS NULL OR t.owner_name = ''`).run();
    await db.prepare(`UPDATE tickets t JOIN people r ON r.id = t.requester_id
      SET t.requester_name = COALESCE(NULLIF(t.requester_name, ''), r.name),
          t.requester_avatar = COALESCE(t.requester_avatar, r.wechat_avatar),
          t.requester_username = COALESCE(NULLIF(t.requester_username, ''), r.username)
      WHERE t.requester_name IS NULL OR t.requester_name = ''`).run();
    await db.prepare(`UPDATE tickets t JOIN projects p ON p.id = t.project_id
      SET t.project_status = COALESCE(t.project_status, p.status),
          t.client_id = CASE WHEN t.client_id = '' THEN p.tenant_id ELSE t.client_id END
      WHERE t.project_status IS NULL OR t.client_id = ''`).run();
    await db.prepare(`UPDATE tickets t JOIN tenants tn ON tn.id = t.client_id
      SET t.client_name = COALESCE(NULLIF(t.client_name, ''), tn.name)
      WHERE t.client_name IS NULL OR t.client_name = ''`).run();
  } catch {
    // people/projects/tenants 已删则跳过 backfill
  }

  // 回填/迁移 due_at/warn_at:交付时刻=创建+交付时长;预警时刻=创建+预警时长(新模型,预警应 > 交付)。
  // 选 缺失 或 旧公式(warn_at <= due_at,旧版预警在交付之前)的工单,按新公式重算;重算后 warn>due 不会再选中。
  try {
    const rows = await db
      .prepare(
        "SELECT id, created_at, due_in_hours, risk_warning_hours FROM tickets WHERE due_at IS NULL OR due_at = '' OR warn_at IS NULL OR warn_at = '' OR warn_at <= due_at"
      )
      .all();
    const upd = db.prepare("UPDATE tickets SET due_at = ?, warn_at = ? WHERE id = ?");
    for (const r of rows) {
      const c = dayjs(r.created_at);
      if (!c.isValid()) continue;
      const dh = r.due_in_hours || 72;
      const rh = r.risk_warning_hours || 8;
      await upd.run(c.add(dh, "hour").toISOString(), c.add(rh, "hour").toISOString(), r.id);
    }
  } catch {
    // 回填失败忽略(新单不受影响)
  }

  // 去外键:工单只存 id,不强制关联(本系统统一用 id join,不建 FK)
  await dropForeignKeyIfExists("tickets", "fk_tickets_owner");
  await dropForeignKeyIfExists("tickets", "fk_tickets_requester");
  await dropForeignKeyIfExists("tickets", "fk_tickets_project");

  // 变更游标(outbox 消费进度):单行 kv,k='last_seq'
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS ops_sync_state (k VARCHAR(64) PRIMARY KEY, v BIGINT NOT NULL DEFAULT 0)"
  ).run();

  // 项目状态流转记录(项目池:谁/何时把项目状态 X→Y + 富文本评论)
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ops_project_status_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id VARCHAR(64) NOT NULL,
        project_name VARCHAR(160),
        kind VARCHAR(16) NOT NULL DEFAULT 'status',
        from_status VARCHAR(20),
        to_status VARCHAR(20) NOT NULL,
        actor_id VARCHAR(64),
        actor_name VARCHAR(120),
        comment_html MEDIUMTEXT,
        created_at VARCHAR(40) NOT NULL,
        KEY idx_psl_project (project_id),
        KEY idx_psl_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    )
    .run();
  // 老库补 kind 列(status=状态变更 / stage=阶段变更);阶段名最长 6 字,VARCHAR(20) 够用
  await ensureColumn("ops_project_status_logs", "kind", "VARCHAR(16) NOT NULL DEFAULT 'status'");

  // 项目状态时长阈值配置(每状态:是否监控 enabled + 停留多久算超时 stale_hours)
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ops_project_status_settings (
        status VARCHAR(20) PRIMARY KEY,
        enabled TINYINT NOT NULL DEFAULT 1,
        stale_hours INT NOT NULL DEFAULT 48,
        sort_order INT NOT NULL DEFAULT 0,
        updated_at VARCHAR(40) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    )
    .run();

  // 项目阶段时长阈值配置(每阶段:是否监控 enabled + 在该阶段停留多久算超时 stale_hours,按工作时间)
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ops_project_stage_settings (
        stage VARCHAR(40) PRIMARY KEY,
        enabled TINYINT NOT NULL DEFAULT 1,
        stale_hours INT NOT NULL DEFAULT 72,
        sort_order INT NOT NULL DEFAULT 0,
        updated_at VARCHAR(40) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    )
    .run();

  // 项目「ops 自有扩展字段」(1:1,project_id = soyoo 项目 id)。soyoo 没有、ops 想加的字段都放这,以后扩展加列即可。
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ops_project_ext (
        project_id VARCHAR(64) PRIMARY KEY,
        stage VARCHAR(40),
        stage_changed_at VARCHAR(40),
        updated_at VARCHAR(40)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    )
    .run();
  // 项目备注(ops 自有,富文本;并入流转记录 kind=remark,此列存当前值)
  await ensureColumn("ops_project_ext", "remark", "MEDIUMTEXT");

  // 通知(铃铛数据源):一条 = 发给某人的一条消息;dedup_key 唯一防重,read_at 空=未读
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ops_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        recipient_id VARCHAR(64) NOT NULL,
        event_key VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL DEFAULT '',
        body MEDIUMTEXT,
        link VARCHAR(512) NOT NULL DEFAULT '',
        ref_type VARCHAR(32) NOT NULL DEFAULT '',
        ref_id VARCHAR(64) NOT NULL DEFAULT '',
        dedup_key VARCHAR(191) NOT NULL,
        read_at VARCHAR(40),
        created_at VARCHAR(40) NOT NULL,
        UNIQUE KEY uniq_dedup (dedup_key),
        KEY idx_recipient_unread (recipient_id, read_at, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    )
    .run();

  // 通知事件配置(每事件:是否启用 enabled + 事件专属配置 config_json,如 project_overdue 的收件人环节)
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ops_notification_settings (
        event_key VARCHAR(64) PRIMARY KEY,
        enabled TINYINT NOT NULL DEFAULT 1,
        config_json MEDIUMTEXT,
        updated_at VARCHAR(40) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    )
    .run();

  // 通用可调参数(k/v):如 scan_interval_min 通知扫描间隔(分钟),管理员可在配置页改
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ops_config (
        k VARCHAR(64) PRIMARY KEY,
        v VARCHAR(255) NOT NULL DEFAULT '',
        updated_at VARCHAR(40) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    )
    .run();
}

async function ensureColumn(tableName, columnName, definition) {
  if (!(await db.columnExists(tableName, columnName))) {
    await db.prepare(`ALTER TABLE ${safeIdentifier(tableName)} ADD COLUMN ${safeIdentifier(columnName)} ${definition}`).run();
  }
}

// 幂等设置列注释(用于标记弃用):仅当当前注释不同才 MODIFY,避免每次启动重建表
async function ensureColumnComment(tableName, columnName, columnType, comment) {
  const row = await db
    .prepare(
      "SELECT COLUMN_COMMENT AS comment FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?"
    )
    .get(tableName, columnName);
  if (row && row.comment !== comment) {
    const safeComment = comment.replace(/'/g, "''");
    await db
      .prepare(`ALTER TABLE ${safeIdentifier(tableName)} MODIFY ${safeIdentifier(columnName)} ${columnType} COMMENT '${safeComment}'`)
      .run();
  }
}

async function ensureIndex(indexName, tableName, columns) {
  if (!(await db.indexExists(tableName, indexName))) {
    await db.prepare(`CREATE INDEX ${safeIdentifier(indexName)} ON ${safeIdentifier(tableName)} (${columns})`).run();
  }
}

// 首次种默认环节(分类)+ 按标签名绑定 soyoo 标签。幂等:已有则跳过。
async function seedDefaultSegments() {
  const row = await db.prepare("SELECT COUNT(*) AS c FROM ops_segments").get();
  if (row && row.c > 0) return;
  const now = new Date().toISOString();
  // hours=交付时长(目标,较小),risk=预警时长(最后死线,必须 > 交付)。超过交付→橙,超过预警→红
  const defaults = [
    { name: "程序", hours: 48, risk: 72, tags: ["程序", "cocos开发", "unity开发"] },
    { name: "美术", hours: 36, risk: 60, tags: ["模型", "动画", "UI"] },
    { name: "策划", hours: 24, risk: 48, tags: ["制片"] },
    { name: "地编", hours: 24, risk: 48, tags: ["地编"] },
    { name: "外包", hours: 48, risk: 72, tags: ["外包"] },
  ];
  const insertSeg = db.prepare(
    "INSERT INTO ops_segments (name, default_delivery_hours, risk_warning_hours, sort_order, updated_at) VALUES (?, ?, ?, ?, ?)"
  );
  const findSeg = db.prepare("SELECT id FROM ops_segments WHERE name = ?");
  const findTag = db.prepare("SELECT id FROM tags WHERE name = ?");
  const bind = db.prepare("INSERT IGNORE INTO ops_segment_tags (segment_id, tag_id) VALUES (?, ?)");
  for (const [index, seg] of defaults.entries()) {
    await insertSeg.run(seg.name, seg.hours, seg.risk, index, now);
    const created = await findSeg.get(seg.name);
    if (!created) continue;
    for (const tagName of seg.tags) {
      const tag = await findTag.get(tagName);
      if (tag) await bind.run(created.id, tag.id);
    }
  }
}

async function seedConfigIfMissing() {
  const now = new Date().toISOString();
  await db.transaction(async () => {
    await seedConfigRows(now);
  });
}

async function seedConfigRows(now) {
  const projectNameCount = (await db.prepare("SELECT COUNT(*) AS count FROM project_name_options").get()).count;
  if (projectNameCount === 0) {
    const insertProjectName = db.prepare(
      `INSERT INTO project_name_options (id, name, is_active, sort_order, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?, ?)`
    );
    for (const [index, option] of seedProjectNameOptions.entries()) {
      await insertProjectName.run(option.id, option.name, index, now, now);
    }
  }

  const insertType = db.prepare(
    `INSERT IGNORE INTO ticket_type_settings (
      type_key, label, default_delivery_hours, risk_warning_hours, is_active, sort_order, updated_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?)`
  );
  for (const [index, setting] of seedTicketTypeSettings.entries()) {
    await insertType.run(
      setting.typeKey,
      setting.label,
      setting.defaultDeliveryHours,
      setting.riskWarningHours ?? defaultRiskWarningHours,
      index,
      now
    );
  }

  // 项目状态时长阈值默认值(幂等 INSERT IGNORE;管理员可在配置页改)。enabled=0 不监控:已完成/回收中/客户暂停
  const insertStatusSetting = db.prepare(
    `INSERT IGNORE INTO ops_project_status_settings (status, enabled, stale_hours, sort_order, updated_at) VALUES (?, ?, ?, ?, ?)`
  );
  const statusDefaults = [
    { status: "未启动", enabled: 1, hours: 48 },
    { status: "推进中", enabled: 1, hours: 168 },
    { status: "已完成", enabled: 0, hours: 0 },
    { status: "已反馈", enabled: 1, hours: 24 },
    { status: "待反馈", enabled: 1, hours: 48 },
    { status: "回收中", enabled: 0, hours: 0 },
    { status: "客户暂停", enabled: 0, hours: 0 },
  ];
  for (const [index, s] of statusDefaults.entries()) {
    await insertStatusSetting.run(s.status, s.enabled, s.hours, index, now);
  }

  // 项目阶段时长阈值默认值(工作小时;管理员可在配置页改)。顺序与 PROJECT_STAGES 一致
  const insertStageSetting = db.prepare(
    `INSERT IGNORE INTO ops_project_stage_settings (stage, enabled, stale_hours, sort_order, updated_at) VALUES (?, ?, ?, ?, ?)`
  );
  const stageDefaults = ["资产确认", "场景单帧版本", "可交互初版", "功能完整版", "最终交付版"];
  for (const [index, stage] of stageDefaults.entries()) {
    await insertStageSetting.run(stage, 1, 72, index, now);
  }

  // 通知事件默认开关(幂等;管理员可在「设置→通知」改)。config_json 留空,project_overdue 收件人环节由管理员配
  const insertNotifSetting = db.prepare(
    `INSERT IGNORE INTO ops_notification_settings (event_key, enabled, config_json, updated_at) VALUES (?, 1, NULL, ?)`
  );
  for (const eventKey of ["ticket_assigned", "ticket_overdue_deliver", "ticket_overdue_warn", "project_overdue", "ticket_priority_changed", "ticket_status_changed"]) {
    await insertNotifSetting.run(eventKey, now);
  }
  // 通用配置默认值:通知扫描间隔 15 分钟(最小 10);老库里 <10 的旧值统一抬到 15
  await db.prepare(`INSERT IGNORE INTO ops_config (k, v, updated_at) VALUES ('scan_interval_min', '15', ?)`).run(now);
  await db.prepare(`UPDATE ops_config SET v = '15', updated_at = ? WHERE k = 'scan_interval_min' AND CAST(v AS UNSIGNED) < 10`).run(now);
}

async function getBootstrap(user) {
  const projects = await getVisibleProjects(user);
  const projectIds = projects.map((project) => project.id);
  const tickets = await getVisibleTickets(user);
  const ticketPersonIds = Array.from(new Set(tickets.flatMap((ticket) => [ticket.requesterId, ticket.ownerId])));
  const people = await getVisiblePeople(user, projectIds, ticketPersonIds);
  const config = await getCompanyConfig();

  return {
    currentUser: user,
    people,
    projects,
    tickets,
    config,
  };
}

async function getCompanyConfig() {
  return {
    projectNameOptions: (await db
      .prepare("SELECT * FROM project_name_options WHERE is_active = 1 ORDER BY sort_order, name")
      .all())
      .map((row) => ({
        id: row.id,
        name: row.name,
        projectId: String(row.id).startsWith("ops-project-") ? row.id : undefined,
        source: getProjectNameOptionSource(row.id),
      })),
    ticketTypeSettings: (await db
      .prepare("SELECT * FROM ticket_type_settings WHERE is_active = 1 ORDER BY sort_order, label")
      .all())
      .map((row) => ({
        typeKey: row.type_key,
        label: row.label,
        defaultDeliveryHours: row.default_delivery_hours,
        riskWarningHours: row.risk_warning_hours,
      })),
  };
}

async function getVisibleProjectIds(user) {
  if (user.roleKey === "admin") {
    return (await db.prepare(`SELECT id FROM projects ORDER BY id`).all()).map((row) => row.id);
  }

  return (await db
    .prepare(
      `SELECT DISTINCT projects.id
       FROM projects
       LEFT JOIN project_team ON project_team.project_id = projects.id
       WHERE (projects.owner_id = ? OR project_team.person_id = ?)
       ORDER BY projects.id`
    )
    .all(user.id, user.id))
    .map((row) => row.id);
}

async function getVisibleProjects(user) {
  const ids = await getVisibleProjectIds(user);
  if (!ids.length) return [];
  const rows = await db.prepare(`SELECT * FROM projects WHERE id IN (${placeholders(ids)}) ORDER BY id`).all(...ids);
  return Promise.all(rows.map(mapProject));
}

async function getVisiblePeople(user, projectIds, ticketPersonIds = []) {
  if (user.roleKey === "admin") {
    const rows = await db.prepare(`SELECT * FROM people WHERE disabled_at IS NULL ORDER BY id`).all();
    return Promise.all(rows.map(async (row) => mapPerson(row, await getPersonProjectIds(row.id))));
  }

  const allowedPersonIds = Array.from(new Set([user.id, ...ticketPersonIds]));
  const rows = await db
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
  return Promise.all(rows.map(async (row) => mapPerson(row, await getPersonProjectIds(row.id))));
}

async function getVisibleTickets(user) {
  let rows;
  if (user.roleKey === "admin") {
    rows = await db.prepare(`SELECT * FROM tickets ORDER BY created_at DESC, id DESC`).all();
  } else {
    rows = await db
      .prepare(
        `SELECT DISTINCT *
         FROM tickets
         WHERE (requester_id = ? OR owner_id = ?)
         ORDER BY created_at DESC, id DESC`
      )
      .all(user.id, user.id);
  }
  return Promise.all(rows.map(mapTicket));
}

async function getPerson(id) {
  const row = await db.prepare("SELECT * FROM people WHERE id = ? AND disabled_at IS NULL").get(id);
  return row ? mapPerson(row, await getPersonProjectIds(row.id)) : null;
}

async function getPersonProjectIds(personId) {
  return (await db.prepare("SELECT project_id FROM project_team WHERE person_id = ? ORDER BY project_id").all(personId)).map((row) => row.project_id);
}

async function getTicketById(ticketId) {
  const row = await db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
  return row ? mapTicket(row) : null;
}

function canReadTicket(user, ticket) {
  if (user.roleKey === "admin") return true;
  return ticket.requesterId === user.id || ticket.ownerId === user.id;
}

function canMutateTicket(user, ticket) {
  return user.roleKey === "admin" || ticket.requesterId === user.id || ticket.ownerId === user.id;
}

async function getDefaultDeliveryHours(typeKey) {
  const row = await db.prepare("SELECT default_delivery_hours FROM ticket_type_settings WHERE type_key = ?").get(typeKey);
  return row ? row.default_delivery_hours : defaultDeliveryHours;
}

async function isConfiguredProjectName(name) {
  return Boolean(await db.prepare("SELECT 1 FROM project_name_options WHERE name = ? AND is_active = 1").get(name));
}

async function getRiskWarningHours(typeKey) {
  const row = await db.prepare("SELECT risk_warning_hours FROM ticket_type_settings WHERE type_key = ?").get(typeKey);
  return row ? row.risk_warning_hours : defaultRiskWarningHours;
}

async function backfillStoredAttachments() {
  const rows = await db.prepare("SELECT * FROM attachments ORDER BY created_at, id").all();
  const updateAttachment = db.prepare(
    `UPDATE attachments
     SET name = ?, kind = ?, mime_type = ?, size_bytes = ?, size_label = ?, storage_path = ?, sha256 = ?
     WHERE id = ?`
  );
  await db.transaction(async () => {
    for (const row of rows) {
      if (row.storage_path && existsSync(row.storage_path)) continue;
      const storedAttachment = materializeAttachmentFile(row.ticket_id, row, row.id);
      await updateAttachment.run(
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

async function nextTicketId() {
  const date = new Date();
  const yymm = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `REQ-${yymm}-`;
  const row = await db.prepare("SELECT id FROM tickets WHERE id LIKE ? ORDER BY id DESC LIMIT 1").get(`${prefix}%`);
  const next = row ? Number(row.id.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

async function storeAttachment(ticketId, attachment, actorId, request) {
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

  await db.prepare(
    `INSERT INTO attachments (id, ticket_id, name, kind, mime_type, size_bytes, size_label, storage_path, sha256, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, ticketId, name, kind, mimeType, sizeBytes, sizeLabel, storagePath, sha256, createdAt);

  await audit(actorId, "attachment_uploaded", "attachment", id, request, {
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

async function mapProject(row) {
  const teamIds = (await db.prepare("SELECT person_id FROM project_team WHERE project_id = ? ORDER BY person_id").all(row.id)).map(
    (item) => item.person_id
  );
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

async function mapTicket(row) {
  const attachments = (await db.prepare("SELECT * FROM attachments WHERE ticket_id = ? ORDER BY created_at, id").all(row.id)).map(mapAttachment);
  const ageHours = getElapsedHours(row.start_at);
  const statusAgeHours = getElapsedHours(row.status_updated_at);
  const dueInHours = Number(row.due_in_hours ?? defaultDeliveryHours);
  const remainingHours = row.status === "已完成" ? 0 : dueInHours - ageHours;
  const riskWarningHours = await getRiskWarningHours(row.discipline);
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

async function audit(actorId, action, entityType, entityId, request, metadata = null) {
  await db.prepare(
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

function safeIdentifier(value) {
  const identifier = String(value);
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
  return `\`${identifier}\``;
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

function getProjectNameOptionSource(id) {
  const value = String(id);
  if (value.startsWith("ops-tenant-")) return "ops-tenant";
  if (value.startsWith("ops-project-")) return "ops-project";
  return "local";
}

// 登录建档:用 soyoo 登录返回的用户信息 upsert 本地身份(替代"必须先同步";新用户首次登录即建档)。
// auth 已由 soyoo 完成,password_hash 仅占位(列 NOT NULL),登录不校验本地密码。
async function upsertPersonFromSoyoo({ id, username, name, roleKey, wechatName = "", wechatAvatar = "" }) {
  await db
    .prepare(
      `INSERT INTO people (id, username, password_hash, name, wechat_name, wechat_avatar, role_key, title, discipline, capacity, completion, disabled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', '', 0, 0, NULL)
       ON DUPLICATE KEY UPDATE
         username = VALUES(username),
         name = VALUES(name),
         wechat_name = VALUES(wechat_name),
         wechat_avatar = VALUES(wechat_avatar),
         role_key = VALUES(role_key),
         disabled_at = NULL`
    )
    .run(id, username, hashPassword(seedPassword), name, wechatName, wechatAvatar, roleKey);
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
  upsertPersonFromSoyoo,
  verifyPassword,
};
