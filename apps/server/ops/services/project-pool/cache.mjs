import { redisConfig } from "../../../config/runtime.mjs";
import { logger } from "../../../core/logger.mjs";
import { redisDelPattern, redisGetJson, redisSetJson } from "../../../core/redis-client.mjs";

const SNAPSHOT_ROWS_KEY = "ops:project-pool:snapshot:v1:db-rows";

function cacheKey(statusNames = []) {
  const statuses = [...new Set((statusNames || []).map((name) => String(name || "").trim()).filter(Boolean))].sort();
  return statuses.length ? `${SNAPSHOT_ROWS_KEY}:status:${statuses.join("|")}` : SNAPSHOT_ROWS_KEY;
}

function normalizeSnapshotRows(value) {
  if (!Array.isArray(value)) return null;
  return value
    .map((row) => ({
      project_id: String(row?.project_id ?? ""),
      row_json: String(row?.row_json ?? ""),
      member_ids_json: row?.member_ids_json == null ? null : String(row.member_ids_json),
    }))
    .filter((row) => row.project_id && row.row_json);
}

export async function readProjectPoolSnapshotRowsCache(statusNames = []) {
  const key = cacheKey(statusNames);
  const cached = normalizeSnapshotRows(await redisGetJson(key));
  if (!cached) return null;
  logger.info("[ops-project-pool-cache] hit", { key, rows: cached.length });
  return cached;
}

export async function writeProjectPoolSnapshotRowsCache(rows, statusNames = []) {
  const key = cacheKey(statusNames);
  const normalized = normalizeSnapshotRows(rows);
  if (!normalized) return false;
  const ok = await redisSetJson(key, normalized, redisConfig.projectPoolTtlSeconds);
  if (ok) logger.info("[ops-project-pool-cache] written", { key, rows: normalized.length, ttlSeconds: redisConfig.projectPoolTtlSeconds });
  return ok;
}

export async function invalidateProjectPoolSnapshotRowsCache(reason = "") {
  const ok = await redisDelPattern(`${SNAPSHOT_ROWS_KEY}*`);
  if (ok) logger.info("[ops-project-pool-cache] invalidated", { reason });
  return ok;
}
