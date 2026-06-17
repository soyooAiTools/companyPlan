// Prisma 客户端单例 —— 新提单接口(/api/ops/*)专用。
// 与现有 mysql2 共用同一个 MySQL;URL 由现有 COMPANYPLAN_MYSQL_* 配置构造,不另设 DATABASE_URL。
import { PrismaClient } from "@prisma/client";
import { mysqlConfig } from "../config/runtime.mjs";

function buildDatabaseUrl() {
  const { user, password, host, port, database } = mysqlConfig;
  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  return `mysql://${auth}@${host}:${port}/${database}`;
}

export const prisma = new PrismaClient({ datasourceUrl: buildDatabaseUrl() });
