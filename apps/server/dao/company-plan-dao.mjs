export function createCompanyPlanDao(db) {
  return {
    transaction(fn) {
      return db.transaction(fn);
    },

    async findActivePersonByUsername(username) {
      return db.prepare("SELECT * FROM people WHERE username = ? AND disabled_at IS NULL").get(username);
    },

    async insertSession(sessionId, personId, createdAt, expiresAt) {
      await db.prepare("INSERT INTO sessions (id, person_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
        sessionId,
        personId,
        createdAt,
        expiresAt
      );
    },

    async revokeSession(sessionId, revokedAt) {
      await db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?").run(revokedAt, sessionId);
    },

    async listTicketTypeKeys() {
      return (await db.prepare("SELECT type_key FROM ticket_type_settings").all()).map((row) => row.type_key);
    },

    async listProjectNameMap() {
      return (await db
        .prepare("SELECT id, name FROM project_name_options")
        .all())
        .reduce((items, row) => items.set(row.id, row.name), new Map());
    },

    async replaceProjectNameOptions(options, now) {
      await db.prepare("DELETE FROM project_name_options").run();
      const insertProjectName = db.prepare(
        `INSERT INTO project_name_options (id, name, is_active, sort_order, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, ?)`
      );
      for (const [index, option] of options.entries()) {
        await insertProjectName.run(option.id, option.name, index, now, now);
      }
    },

    async updateTicketTypeSettings(settings, now) {
      const updateType = db.prepare(
        `UPDATE ticket_type_settings
         SET default_delivery_hours = ?, risk_warning_hours = ?, updated_at = ?
         WHERE type_key = ?`
      );
      for (const setting of settings) {
        await updateType.run(setting.defaultDeliveryHours, setting.riskWarningHours, now, setting.typeKey);
      }
    },

    async renameTicketSourceProjects(renamedProjectNames, now) {
      const renameTicketSourceProject = db.prepare(
        `UPDATE tickets
         SET source_project_name = ?, updated_at = ?
         WHERE source_project_name = ?`
      );
      for (const item of renamedProjectNames) {
        await renameTicketSourceProject.run(item.to, now, item.from);
      }
    },

    async insertTicket(ticket, now) {
      await db.prepare(
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
      ).run({
        ...ticket,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        statusUpdatedAt: now.toISOString(),
      });
    },

    async updateTicketStatus(ticketId, status, now) {
      await db.prepare(
        `UPDATE tickets
         SET status_age_days = CASE WHEN status = ? THEN status_age_days ELSE 0 END, status = ?, updated_at = ?, status_updated_at = ?
         WHERE id = ?`
      ).run(status, status, now, now, ticketId);
    },

    async updateTicketTimeline(ticketId, offsetHours, spanHours, now) {
      await db.prepare(
        `UPDATE tickets
         SET timeline_offset_hours = ?, timeline_span_hours = ?, timeline_offset_days = ?, updated_at = ?
         WHERE id = ?`
      ).run(offsetHours, spanHours, Math.round(offsetHours / 24), now, ticketId);
    },

    async findAttachmentById(attachmentId) {
      return db.prepare("SELECT * FROM attachments WHERE id = ?").get(attachmentId);
    },

    async listAuditEvents(limit) {
      return db.prepare("SELECT * FROM audit_events ORDER BY id DESC LIMIT ?").all(limit);
    },
  };
}
