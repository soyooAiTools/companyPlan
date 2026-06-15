import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
export const dataDir = process.env.COMPANYPLAN_DATA_DIR ?? join(repoRoot, "data");
export const uploadDir = process.env.COMPANYPLAN_UPLOAD_DIR ?? join(dataDir, "uploads");
export const mysqlConfig = {
  host: process.env.COMPANYPLAN_MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.COMPANYPLAN_MYSQL_PORT ?? "3306"),
  user: process.env.COMPANYPLAN_MYSQL_USER ?? "companyplan",
  password: process.env.COMPANYPLAN_MYSQL_PASSWORD ?? "",
  database: process.env.COMPANYPLAN_MYSQL_DATABASE ?? "companyplan",
  connectionLimit: Number(process.env.COMPANYPLAN_MYSQL_CONNECTION_LIMIT ?? "10"),
  createDatabase: process.env.COMPANYPLAN_MYSQL_CREATE_DATABASE === "1",
};
export const databaseLabel = `mysql://${mysqlConfig.user}@${mysqlConfig.host}:${mysqlConfig.port}/${mysqlConfig.database}`;
export const sessionCookieName = "companyplan_session";
export const sessionTtlDays = Number(process.env.COMPANYPLAN_SESSION_DAYS ?? "7");
export const maxAttachmentBytes = Number(process.env.COMPANYPLAN_MAX_ATTACHMENT_BYTES ?? `${10 * 1024 * 1024}`);
export const port = Number(process.env.PORT ?? "4174");
export const statusOptions = new Set(["排队中", "进行中", "阻塞", "已完成"]);
export const priorityOptions = new Set(["紧急", "优先", "普通", "低优先"]);
export const attachmentKinds = new Set(["图片", "附件", "文件"]);
export const defaultDeliveryHours = 72;
export const defaultRiskWarningHours = 8;
export const opsIntegration = {
  enabled: process.env.COMPANYPLAN_OPS_ENABLED !== "0",
  baseUrl: process.env.COMPANYPLAN_OPS_BASE_URL ?? "https://helperapi.soyootech.com",
  timeoutMs: Number(process.env.COMPANYPLAN_OPS_TIMEOUT_MS ?? "12000"),
  cacheTtlMs: Number(process.env.COMPANYPLAN_OPS_CACHE_TTL_MS ?? `${10 * 60 * 1000}`),
  concurrency: Number(process.env.COMPANYPLAN_OPS_CONCURRENCY ?? "8"),
  projectMemberLimit: Number(process.env.COMPANYPLAN_OPS_PROJECT_MEMBER_LIMIT ?? "0"),
  includeLocalData: process.env.COMPANYPLAN_OPS_INCLUDE_LOCAL_DATA === "1",
  adminUsernames: splitEnvSet(process.env.COMPANYPLAN_OPS_ADMIN_USERNAMES ?? ""),
};
export const crc32Table = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let index = 0; index < 8; index += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function splitEnvSet(value) {
  return new Set(
    String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}
