import crypto from "node:crypto";
import { existsSync } from "node:fs";

function ok(body, status = 200) {
  return { ok: true, status, body };
}

function fail(status, error) {
  return { ok: false, status, body: { error } };
}

export function createCompanyPlanService(deps) {
  const {
    dao,
    databaseLabel,
    uploadDir,
    sessionTtlDays,
    statusOptions,
    priorityOptions,
    defaultDeliveryHours,
    defaultRiskWarningHours,
    getBootstrap,
    getCompanyConfig,
    getVisibleProjectIds,
    getPerson,
    getPersonProjectIds,
    getTicketById,
    canReadTicket,
    canMutateTicket,
    getDefaultDeliveryHours,
    isConfiguredProjectName,
    mapPerson,
    nextTicketId,
    storeAttachment,
    audit,
    verifyPassword,
    cleanText,
    clampNumber,
    formatDateTime,
    syncExternalDirectory = null,
    getExternalDirectoryStatus = null,
  } = deps;

  async function refreshExternalDirectory(reason) {
    if (syncExternalDirectory) {
      await syncExternalDirectory({ reason });
    }
  }

  return {
    getHealth() {
      return {
        ok: true,
        database: databaseLabel,
        uploadDir,
        ops: getExternalDirectoryStatus ? getExternalDirectoryStatus() : { enabled: false },
        startedAt: process.uptime(),
      };
    },

    async login(payload, auditContext) {
      const username = String(payload?.username ?? "").trim();
      const password = String(payload?.password ?? "");
      await refreshExternalDirectory("login");
      const user = await dao.findActivePersonByUsername(username);

      if (!user || !verifyPassword(password, user.password_hash)) {
        await audit(null, "login_failed", "person", username || "unknown", auditContext, { username });
        return fail(401, "用户名或密码不正确");
      }

      const sessionId = crypto.randomBytes(32).toString("hex");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + sessionTtlDays * 24 * 60 * 60 * 1000);
      await dao.insertSession(sessionId, user.id, now.toISOString(), expiresAt.toISOString());

      await audit(user.id, "login", "person", user.id, auditContext);
      return ok({
        currentUser: mapPerson(user, await getPersonProjectIds(user.id)),
        sessionId,
        expiresAt,
      });
    },

    async logout(sessionId, user, auditContext) {
      if (sessionId) {
        await dao.revokeSession(sessionId, new Date().toISOString());
        await audit(user?.id ?? null, "logout", "session", sessionId, auditContext);
      }
      return ok({ ok: true });
    },

    getSession(user) {
      return ok({ currentUser: user });
    },

    async bootstrap(user) {
      await refreshExternalDirectory("bootstrap");
      return ok(await getBootstrap(user));
    },

    async saveAdminConfig(payload, user, auditContext) {
      const projectNameOptions = Array.isArray(payload?.projectNameOptions) ? payload.projectNameOptions : null;
      const ticketTypeSettings = Array.isArray(payload?.ticketTypeSettings) ? payload.ticketTypeSettings : null;

      if (!projectNameOptions || !ticketTypeSettings) {
        return fail(400, "配置内容不完整");
      }

      const sanitizedNames = [];
      const seenNames = new Set();
      for (const option of projectNameOptions) {
        const name = cleanText(option?.name, 160);
        if (!name || seenNames.has(name)) continue;
        seenNames.add(name);
        sanitizedNames.push({
          id: cleanText(option?.id, 80) || crypto.randomUUID(),
          name,
        });
      }

      if (!sanitizedNames.length) {
        return fail(400, "所属项目列表至少需要保留一个所属项目");
      }

      const knownTypes = new Set(await dao.listTicketTypeKeys());
      const sanitizedTypeSettings = ticketTypeSettings
        .map((item) => ({
          typeKey: cleanText(item?.typeKey, 80),
          defaultDeliveryHours: clampNumber(item?.defaultDeliveryHours, 1, 24 * 30, defaultDeliveryHours),
          riskWarningHours: clampNumber(item?.riskWarningHours, 1, 24 * 7, defaultRiskWarningHours),
        }))
        .filter((item) => knownTypes.has(item.typeKey));

      if (!sanitizedTypeSettings.length) {
        return fail(400, "至少需要保留一个提单类型配置");
      }

      const now = new Date().toISOString();
      const existingProjectNames = await dao.listProjectNameMap();
      const renamedProjectNames = sanitizedNames
        .map((option) => ({
          id: option.id,
          from: existingProjectNames.get(option.id),
          to: option.name,
        }))
        .filter((item) => item.from && item.from !== item.to);

      await dao.transaction(async () => {
        await dao.replaceProjectNameOptions(sanitizedNames, now);
        await dao.updateTicketTypeSettings(sanitizedTypeSettings, now);
        await dao.renameTicketSourceProjects(renamedProjectNames, now);
        await audit(user.id, "admin_config_updated", "system", "companyplan_config", auditContext, {
          projectNameOptions: sanitizedNames.length,
          ticketTypeSettings: sanitizedTypeSettings.length,
          renamedProjectNames: renamedProjectNames.map(({ id, from, to }) => ({ id, from, to })),
        });
      });
      return ok({ config: await getCompanyConfig(), bootstrap: await getBootstrap(user) });
    },

    async createTicket(payload, user, auditContext) {
      await refreshExternalDirectory("create_ticket");
      const visibleProjectIds = await getVisibleProjectIds(user);

      if (!visibleProjectIds.includes(payload?.projectId)) {
        return fail(403, "无权在该项目下创建提单");
      }

      const owner = await getPerson(payload?.ownerId);
      if (!owner) return fail(400, "负责人不存在");
      if (owner.discipline !== payload?.discipline) {
        return fail(400, "负责人岗位与提单环节不匹配");
      }

      const sourceProjectName = cleanText(payload?.sourceProjectName, 160);
      if (!sourceProjectName) return fail(400, "所属项目不能为空");
      if (!(await isConfiguredProjectName(sourceProjectName))) {
        return fail(400, "所属项目不在管理员配置列表中");
      }

      const ticketId = await nextTicketId();
      const now = new Date();
      const deliveryHours = await getDefaultDeliveryHours(payload.discipline);
      const ticket = {
        id: ticketId,
        title: cleanText(payload?.title, 120) || "未命名需求",
        sourceProjectName: sourceProjectName || null,
        projectName: cleanText(payload?.projectName, 160) || null,
        projectId: String(payload.projectId),
        requesterId: user.id,
        ownerId: owner.id,
        discipline: String(payload.discipline),
        startAt: formatDateTime(now),
        status: "排队中",
        priority: priorityOptions.has(payload.priority) ? payload.priority : "普通",
        ageDays: 0,
        statusAgeDays: 0,
        dueInDays: 0,
        dueInHours: deliveryHours,
        timelineOffsetDays: 0,
        timelineOffsetHours: 0,
        timelineSpanHours: deliveryHours,
        needType: cleanText(payload.needType, 80) || "资产补充",
        summary: cleanText(payload.summary, 2000) || "待补充说明",
        hyperlink: cleanText(payload.hyperlink, 500) || null,
        text: cleanText(payload.text, 500) || null,
      };

      await dao.transaction(async () => {
        await dao.insertTicket(ticket, now);
        const attachments = Array.isArray(payload.attachments) ? payload.attachments.slice(0, 10) : [];
        for (const attachment of attachments) {
          await storeAttachment(ticketId, attachment, user.id, auditContext);
        }

        await audit(user.id, "ticket_created", "ticket", ticketId, auditContext, {
          projectId: ticket.projectId,
          ownerId: ticket.ownerId,
          attachmentCount: attachments.length,
        });
      });
      return ok({ ticket: await getTicketById(ticketId) }, 201);
    },

    async updateTicketStatus(ticketId, payload, user, auditContext) {
      const ticket = await getTicketById(ticketId);
      if (!ticket) return fail(404, "提单不存在");
      if (!canReadTicket(user, ticket)) return fail(403, "无权访问该提单");
      if (!canMutateTicket(user, ticket)) return fail(403, "无权修改该提单状态");

      const nextStatus = payload?.status;
      if (!statusOptions.has(nextStatus)) return fail(400, "状态不合法");

      const now = new Date().toISOString();
      await dao.updateTicketStatus(ticket.id, nextStatus, now);
      await audit(user.id, "ticket_status_updated", "ticket", ticket.id, auditContext, {
        from: ticket.status,
        to: nextStatus,
      });
      return ok({ ticket: await getTicketById(ticket.id) });
    },

    async updateTicketTimeline(ticketId, payload, user, auditContext) {
      const ticket = await getTicketById(ticketId);
      if (!ticket) return fail(404, "提单不存在");
      if (user.roleKey !== "admin") return fail(403, "只有管理员可以调整甘特视觉时间线");

      const fallbackOffsetHours = ticket.timelineOffsetHours ?? (ticket.timelineOffsetDays ?? ticket.ageDays ?? 0) * 24;
      const fallbackSpanHours = ticket.timelineSpanHours ?? ticket.dueInHours ?? defaultDeliveryHours;
      const requestedOffset = payload?.offsetHours ?? Number(payload?.offsetDays ?? 0) * 24;
      const requestedSpan = payload?.spanHours ?? payload?.durationHours ?? fallbackSpanHours;
      const offsetHours = clampNumber(requestedOffset, 0, 24 * 30, fallbackOffsetHours);
      const spanHours = clampNumber(requestedSpan, 1, 24 * 45, fallbackSpanHours);

      await dao.updateTicketTimeline(ticket.id, offsetHours, spanHours, new Date().toISOString());
      await audit(user.id, "ticket_timeline_updated", "ticket", ticket.id, auditContext, {
        from: {
          offsetHours: fallbackOffsetHours,
          spanHours: fallbackSpanHours,
        },
        to: {
          offsetHours,
          spanHours,
        },
      });
      return ok({ ticket: await getTicketById(ticket.id) });
    },

    async getAttachmentFile(attachmentId, user, mode) {
      const attachment = await dao.findAttachmentById(attachmentId);
      if (!attachment) return fail(404, "附件不存在");
      const ticket = await getTicketById(attachment.ticket_id);
      if (!ticket || !canReadTicket(user, ticket)) {
        return fail(403, mode === "download" ? "无权下载该附件" : "无权打开该附件");
      }
      if (!attachment.storage_path || !existsSync(attachment.storage_path)) {
        return fail(404, "附件文件未落盘");
      }
      return ok({ attachment, mode });
    },

    async listAudit(query, user) {
      if (user.roleKey !== "admin") return fail(403, "只有管理员可以查看审计日志");
      const rows = await dao.listAuditEvents(clampNumber(query?.limit, 1, 200, 100));
      return ok({
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
    },
  };
}
