import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { mysqlConfig } from "../config/runtime.mjs";

const apply = process.argv.includes("--apply");
const rollbackArgIndex = process.argv.indexOf("--rollback-file");
const rollbackFile = rollbackArgIndex >= 0 ? String(process.argv[rollbackArgIndex + 1] || "").trim() : "";
const projectArgIndex = process.argv.indexOf("--project-id");
const projectId = projectArgIndex >= 0 ? String(process.argv[projectArgIndex + 1] || "").trim() : "";
const sinceDaysArgIndex = process.argv.indexOf("--since-days");
const sinceDays = sinceDaysArgIndex >= 0 ? Number(process.argv[sinceDaysArgIndex + 1]) : null;
const backupArgIndex = process.argv.indexOf("--backup-file");
const backupFile = backupArgIndex >= 0 ? String(process.argv[backupArgIndex + 1] || "").trim() : "";

if (apply && rollbackFile) {
  console.error("--apply 不能和 --rollback-file 同时使用");
  process.exit(1);
}
if (rollbackArgIndex >= 0 && !rollbackFile) {
  console.error("--rollback-file 需要传备份日志路径");
  process.exit(1);
}
if (projectArgIndex >= 0 && !projectId) {
  console.error("--project-id 需要传项目 ID");
  process.exit(1);
}
if (sinceDaysArgIndex >= 0 && (!Number.isFinite(sinceDays) || sinceDays <= 0)) {
  console.error("--since-days 需要传大于 0 的天数");
  process.exit(1);
}

const { createDatabase: _createDatabase, connectionLimit: _connectionLimit, ...connectionConfig } = mysqlConfig;
const connection = await mysql.createConnection(connectionConfig);
try {
  if (rollbackFile) {
    const backup = JSON.parse(await readFile(rollbackFile, "utf8"));
    const rows = Array.isArray(backup.rows) ? backup.rows : [];
    if (!rows.length) {
      console.log("备份日志中没有可回滚的数据");
    } else {
      await connection.beginTransaction();
      try {
        for (const row of rows) {
          const [result] = await connection.execute(
            "UPDATE tickets SET project_id = ?, updated_at = updated_at WHERE id = ? AND project_id = ?",
            [row.oldProjectId, row.id, row.newProjectId],
          );
          if (result.affectedRows !== 1) throw new Error(`回滚校验失败，工单 ${row.id} 当前 project_id 不是备份中的新值`);
        }
        await connection.commit();
        console.log(`已回滚 ${rows.length} 条工单。`);
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
    process.exit(0);
  }

  const where = [
    "project_version_id IS NOT NULL",
    "project_version_id <> ''",
    "project_id NOT LIKE '%::version-%'",
    "status <> ?",
  ];
  const params = ["已完成"];
  if (projectId) {
    where.push("project_id = ?");
    params.push(projectId);
  }
  if (sinceDays != null) {
    where.push("created_at >= ?");
    params.push(new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000));
  }

  const [rows] = await connection.query(
    `SELECT id, project_id, project_version_id, project_version_code, project_version_name, title
       FROM tickets
      WHERE ${where.join(" AND ")}
      ORDER BY created_at ASC, id ASC`,
    params,
  );

  const updates = rows.map((row) => ({
    ...row,
    nextProjectId: `${row.project_id}::version-${row.project_version_id}`,
  }));

  console.log(`${apply ? "准备修复" : "预览"} ${updates.length} 条版本工单${projectId ? `，项目 ${projectId}` : ""}${sinceDays != null ? `，最近 ${sinceDays} 天` : ""}`);
  for (const row of updates) {
    console.log(`${row.id} | ${row.project_id} -> ${row.nextProjectId} | ${row.project_version_code || ""} ${row.project_version_name || ""} | ${row.title || ""}`);
  }

  if (!apply || !updates.length) {
    if (!apply) console.log("当前为预览模式，未修改数据库。确认无误后追加 --apply 执行。");
  } else {
    const defaultBackupFile = join(dirname(fileURLToPath(import.meta.url)), "migration-logs", `version-ticket-project-id-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    const outputBackupFile = backupFile || defaultBackupFile;
    await mkdir(dirname(outputBackupFile), { recursive: true });
    await writeFile(
      outputBackupFile,
      JSON.stringify(
        {
          migration: "sync-version-scoped-ticket-project-ids",
          createdAt: new Date().toISOString(),
          filters: { projectId: projectId || null, sinceDays, status: "非已完成" },
          rows: updates.map((row) => ({
            id: row.id,
            oldProjectId: row.project_id,
            newProjectId: row.nextProjectId,
            projectVersionId: row.project_version_id,
            projectVersionCode: row.project_version_code,
            projectVersionName: row.project_version_name,
            title: row.title,
          })),
        },
        null,
        2,
      ),
      "utf8",
    );
    console.log(`已写入备份日志：${outputBackupFile}`);
    await connection.beginTransaction();
    try {
      for (const row of updates) {
        await connection.execute(
          "UPDATE tickets SET project_id = ?, updated_at = updated_at WHERE id = ? AND project_id = ?",
          [row.nextProjectId, row.id, row.project_id],
        );
      }
      await connection.commit();
      console.log(`已修复 ${updates.length} 条版本工单。`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }
} finally {
  await connection.end();
}
