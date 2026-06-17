import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { dataDir, mysqlConfig } from "../config/runtime.mjs";
import { createDatabase } from "../db/connection.mjs";
import { bindCompanyPlanStore, initializeSchema } from "../db/company-plan-store.mjs";

const sqlitePath =
  process.env.COMPANYPLAN_SQLITE_PATH ??
  process.env.COMPANYPLAN_DB_PATH ??
  join(dataDir, "companyplan.sqlite");

const tables = [
  {
    name: "people",
    columns: ["id", "username", "password_hash", "name", "role_key", "title", "discipline", "capacity", "completion", "disabled_at"],
  },
  {
    name: "projects",
    columns: [
      "id",
      "name",
      "client",
      "genre",
      "channel",
      "owner_id",
      "status",
      "phase",
      "health",
      "progress",
      "due_in_days",
      "ticket_count",
      "open_ticket_count",
      "discipline_progress_json",
      "blocker",
    ],
  },
  { name: "project_team", columns: ["project_id", "person_id"] },
  {
    name: "tickets",
    columns: [
      "id",
      "title",
      "source_project_name",
      "project_name",
      "project_id",
      "requester_id",
      "owner_id",
      "discipline",
      "start_at",
      "status",
      "priority",
      "age_days",
      "status_age_days",
      "due_in_days",
      "due_in_hours",
      "timeline_offset_days",
      "timeline_offset_hours",
      "timeline_span_hours",
      "need_type",
      "summary",
      "hyperlink",
      "text",
      "created_at",
      "updated_at",
      "status_updated_at",
    ],
  },
  {
    name: "attachments",
    columns: ["id", "ticket_id", "name", "kind", "mime_type", "size_bytes", "size_label", "storage_path", "sha256", "created_at"],
  },
  { name: "sessions", columns: ["id", "person_id", "created_at", "expires_at", "revoked_at"] },
  {
    name: "audit_events",
    columns: ["id", "actor_id", "action", "entity_type", "entity_id", "ip", "user_agent", "metadata_json", "created_at"],
  },
  {
    name: "project_name_options",
    columns: ["id", "name", "is_active", "sort_order", "created_at", "updated_at"],
  },
  {
    name: "ticket_type_settings",
    columns: ["type_key", "label", "default_delivery_hours", "risk_warning_hours", "is_active", "sort_order", "updated_at"],
  },
];

if (!existsSync(sqlitePath)) {
  throw new Error(`SQLite source file does not exist: ${sqlitePath}`);
}

const db = await createDatabase(mysqlConfig);
bindCompanyPlanStore(db);

try {
  await initializeSchema();
  await assertMysqlIsEmpty();

  for (const table of tables) {
    const rows = readSqliteRows(table);
    await insertRows(table, rows);
    console.log(`migrated ${table.name}: ${rows.length}`);
  }

  await db.prepare("ALTER TABLE audit_events AUTO_INCREMENT = 1").run();
  console.log(`SQLite -> MySQL migration completed: ${sqlitePath} -> ${mysqlConfig.database}`);
} finally {
  await db.close();
}

async function assertMysqlIsEmpty() {
  const counts = await Promise.all(
    tables.map(async (table) => {
      const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${escapeIdentifier(table.name)}`).get();
      return { table: table.name, count: Number(row.count) };
    })
  );
  const populated = counts.filter((item) => item.count > 0);
  if (populated.length) {
    const detail = populated.map((item) => `${item.table}=${item.count}`).join(", ");
    throw new Error(`Refusing to migrate into non-empty MySQL tables: ${detail}`);
  }
}

function readSqliteRows(table) {
  const jsonFields = table.columns.map((column) => `'${column}', ${escapeIdentifier(table.name)}.${escapeIdentifier(column)}`).join(", ");
  const sql = `SELECT COALESCE(json_group_array(json_object(${jsonFields})), '[]') FROM ${escapeIdentifier(table.name)};`;
  const output = runSqlite(sql);
  return JSON.parse(output || "[]");
}

function runSqlite(sql) {
  const result = spawnSync("sqlite3", [sqlitePath, sql], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `sqlite3 exited with status ${result.status}`);
  }
  return result.stdout.trim();
}

async function insertRows(table, rows) {
  if (!rows.length) return;
  const columns = table.columns.map(escapeIdentifier).join(", ");
  const placeholders = table.columns.map(() => "?").join(", ");
  const insert = db.prepare(`INSERT INTO ${escapeIdentifier(table.name)} (${columns}) VALUES (${placeholders})`);
  await db.transaction(async () => {
    for (const row of rows) {
      await insert.run(...table.columns.map((column) => row[column]));
    }
  });
}

function escapeIdentifier(value) {
  return `\`${String(value).replace(/`/g, "``")}\``;
}
