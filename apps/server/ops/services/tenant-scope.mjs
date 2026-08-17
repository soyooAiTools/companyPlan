import { prisma } from "../prisma.mjs";
import { meId, nowIso } from "../ops-helpers.mjs";
import { listTenants } from "../ops-realtime.mjs";

export async function ensureTenantScopeTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS ops_user_tenant_scope (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      tenant_id VARCHAR(64) NOT NULL,
      scope_mode VARCHAR(20) NOT NULL DEFAULT 'include',
      enabled TINYINT NOT NULL DEFAULT 1,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      UNIQUE KEY uniq_outs_user_tenant (user_id, tenant_id),
      KEY idx_outs_user_enabled (user_id, enabled),
      KEY idx_outs_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `;
  try {
    await prisma.$executeRawUnsafe("ALTER TABLE ops_user_tenant_scope ADD COLUMN scope_mode VARCHAR(20) NOT NULL DEFAULT 'include' AFTER tenant_id");
  } catch {
    // 已存在则跳过。项目现有迁移风格是启动幂等补表/补列。
  }
}

function normalizeTenantIds(tenantIds) {
  return [
    ...new Set(
      (Array.isArray(tenantIds) ? tenantIds : [])
        .map((id) => String(id ?? "").trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * 读取当前用户的客户可见范围。
 * @param {*} user 当前登录用户。
 * @returns {Promise<null | { mode: "include" | "exclude", tenantIds: Set<string> }>} null=全部客户。
 */
export async function getUserTenantScope(user) {
  const userId = meId(user);
  if (!userId) return null;
  await ensureTenantScopeTable();
  const rows = await prisma.$queryRaw`
    SELECT tenant_id, scope_mode
    FROM ops_user_tenant_scope
    WHERE user_id = ${userId} AND enabled = 1
    ORDER BY tenant_id ASC
  `;
  if (!rows.length) return null;
  const mode = rows.some((row) => String(row.scope_mode) === "exclude") ? "exclude" : "include";
  return { mode, tenantIds: new Set(rows.map((row) => String(row.tenant_id))) };
}

/**
 * 按客户可见范围过滤列表。
 * @param {Array} rows 待过滤列表。
 * @param {null | { mode: "include" | "exclude", tenantIds: Set<string> }} scope 客户范围；null=全部客户。
 * @param {(row: *) => string} tenantIdOfRow 从行数据中取客户 id。
 * @returns {Array} 过滤后的列表。
 */
export function filterByTenantScope(rows, scope, tenantIdOfRow) {
  if (!scope) return rows;
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const matched = scope.tenantIds.has(String(tenantIdOfRow(row) ?? ""));
    return scope.mode === "exclude" ? !matched : matched;
  });
}

export async function getUserTenantScopePayload(user) {
  const [scope, tenants] = await Promise.all([getUserTenantScope(user), listTenants().catch(() => [])]);
  const tenantIds = scope ? [...scope.tenantIds] : [];
  const tenantById = new Map(tenants.map((tenant) => [String(tenant.id), tenant]));
  return {
    mode: scope?.mode || "all",
    tenantIds,
    selectedTenants: tenantIds.map((id) => tenantById.get(id) || { id, name: id }),
    tenants,
  };
}

export async function saveUserTenantScope({ user, mode, tenantIds }) {
  const userId = meId(user);
  if (!userId) return { error: "当前用户无效" };
  const normalizedMode = mode === "exclude" ? "exclude" : mode === "include" || mode === "custom" ? "include" : "all";
  const ids = normalizedMode === "all" ? [] : normalizeTenantIds(tenantIds);
  if (normalizedMode !== "all" && ids.length === 0) return { error: "请至少选择一个客户" };
  await ensureTenantScopeTable();
  const now = nowIso();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM ops_user_tenant_scope WHERE user_id = ${userId}`;
    for (const tenantId of ids) {
      await tx.$executeRaw`
        INSERT INTO ops_user_tenant_scope (user_id, tenant_id, scope_mode, enabled, created_at, updated_at)
        VALUES (${userId}, ${tenantId}, ${normalizedMode}, 1, ${now}, ${now})
      `;
    }
  });
  return { scope: await getUserTenantScopePayload(user) };
}
