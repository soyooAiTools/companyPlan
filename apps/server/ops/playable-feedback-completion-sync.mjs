import { playableFeedbackCompletionSync } from "../config/runtime.mjs";
import { prisma } from "./prisma.mjs";
import { soyooClient, soyooId } from "./soyoo-client.mjs";

const permanentStatuses = new Set([400, 401, 403, 404, 409, 410, 422]);

function isPermanentFailure(error) {
  return permanentStatuses.has(Number(error?.status));
}

export async function syncPlayableFeedbackCompletionOutbox({
  database = prisma,
  logger = console,
  deliver = soyooClient.recordPlayableFeedbackCompletion,
  now = () => new Date(),
  settings = playableFeedbackCompletionSync,
} = {}) {
  const currentTime = now();
  const rows = await database.$queryRawUnsafe(
    `SELECT candidate.*
       FROM ops_ticket_playable_feedback_outbox candidate
      WHERE candidate.status IN ('pending', 'retrying')
        AND candidate.next_attempt_at <= ?
        AND NOT EXISTS (
          SELECT 1
            FROM ops_ticket_playable_feedback_outbox older
           WHERE older.ticket_id = candidate.ticket_id
             AND older.source_feedback_id = candidate.source_feedback_id
             AND older.status IN ('pending', 'retrying', 'failed')
             AND (older.created_at < candidate.created_at OR (older.created_at = candidate.created_at AND older.id < candidate.id))
        )
      ORDER BY candidate.created_at ASC, candidate.id ASC
      LIMIT ?`,
    currentTime.toISOString(), settings.batchSize,
  );

  for (const row of rows) {
    try {
      await deliver(row.source_review_id, {
        eventId: row.id,
        opsBatchId: row.batch_id,
        assignmentId: row.source_assignment_id,
        opsTicketId: row.ticket_id,
        feedbackId: row.source_feedback_id,
        completed: !!row.completed,
        actorUserId: Number(soyooId(row.actor_id)),
        actorName: row.actor_name,
        actorAvatar: row.actor_avatar,
        occurredAt: row.occurred_at || row.created_at,
      });
      await database.$executeRawUnsafe(
        "UPDATE ops_ticket_playable_feedback_outbox SET status = 'delivered', delivered_at = ?, last_error = NULL WHERE id = ?",
        now().toISOString(), row.id,
      );
    } catch (error) {
      const attempts = Number(row.attempts || 0) + 1;
      const message = String(error?.message || "同步失败").slice(0, 500);
      if (isPermanentFailure(error)) {
        await database.$executeRawUnsafe(
          "UPDATE ops_ticket_playable_feedback_outbox SET status = 'failed', attempts = ?, last_error = ? WHERE id = ?",
          attempts, message, row.id,
        );
        logger.error?.("playable feedback completion entered manual queue", { outboxId: row.id, status: error?.status, error: message });
        continue;
      }
      const delayMs = Math.min(30 * 60_000, 120_000 * 2 ** Math.min(attempts - 1, 4));
      await database.$executeRawUnsafe(
        "UPDATE ops_ticket_playable_feedback_outbox SET status = 'retrying', attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?",
        attempts, new Date(now().getTime() + delayMs).toISOString(), message, row.id,
      );
      logger.warn?.("playable feedback completion sync failed", { outboxId: row.id, error: message });
    }
  }
  return { processed: rows.length };
}

export async function listPlayableFeedbackCompletionFailures(database = prisma, limit = 100) {
  return database.$queryRawUnsafe(
    `SELECT id, batch_id, ticket_id, source_review_id, source_feedback_id, completed,
            actor_id, actor_name, actor_avatar, occurred_at, attempts, last_error, created_at
       FROM ops_ticket_playable_feedback_outbox
      WHERE status = 'failed'
      ORDER BY created_at DESC
      LIMIT ?`,
    Math.min(200, Math.max(1, Number(limit) || 100)),
  );
}

export async function retryPlayableFeedbackCompletionFailure(database = prisma, id) {
  const result = await database.$executeRawUnsafe(
    `UPDATE ops_ticket_playable_feedback_outbox
        SET status = 'pending', attempts = 0, next_attempt_at = ?, last_error = NULL
      WHERE id = ? AND status = 'failed'`,
    new Date().toISOString(), String(id || ""),
  );
  return Number(result || 0) > 0;
}

let running = false;

export function startPlayableFeedbackCompletionSync({ logger = console } = {}) {
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await syncPlayableFeedbackCompletionOutbox({ logger });
    } catch (error) {
      logger.error?.(error, { scope: "playable-feedback-completion-sync" });
    } finally {
      running = false;
    }
  };
  setInterval(run, playableFeedbackCompletionSync.intervalSeconds * 1000).unref?.();
  void run();
}
