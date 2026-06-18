import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// 按环境加载配置：APP_ENV = dev | test | prod → 加载 .env.dev | .env.test | .env.prod（默认 dev）。
// 找不到环境专属文件则回退到 .env。Node ≥20.12 内置 process.loadEnvFile，无需 dotenv 依赖。
// 必须在读取任何 process.env 之前执行，所以放在配置层最顶部。
const appEnv = process.env.APP_ENV || "dev";
for (const name of [`.env.${appEnv}`]) {
  // runtime.mjs 位于 apps/server/config/，companyPlan 根目录是 ../../../（.env.* 放在根目录）
  const file = fileURLToPath(new URL(`../../../${name}`, import.meta.url));
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}

export const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
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
// 后台全量同步间隔（毫秒）。默认 30 分钟,作兜底——实时性靠 soyoo push 触发的去抖同步；设 0 关闭定时同步（仍会启动时同步一次）。
export const opsSyncIntervalMs = Number(process.env.COMPANYPLAN_OPS_SYNC_INTERVAL_MS ?? `${30 * 60 * 1000}`);
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
// 阿里云 OSS（富文本编辑器图片上传）。凭证放根 .env：OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET。
export const ossConfig = {
  accessKeyId: process.env.OSS_ACCESS_KEY_ID ?? "",
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET ?? "",
  bucket: process.env.OSS_BUCKET ?? "soyoo-ops-materials",
  region: process.env.OSS_REGION ?? "oss-cn-beijing",
  baseDir: (process.env.OSS_BASE_DIR ?? "soyoo-ops").replace(/^\/+|\/+$/g, ""),
  maxImageBytes: Number(process.env.OSS_MAX_IMAGE_BYTES ?? `${2 * 1024 * 1024}`),
  maxFileBytes: Number(process.env.OSS_MAX_FILE_BYTES ?? `${10 * 1024 * 1024}`),
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
