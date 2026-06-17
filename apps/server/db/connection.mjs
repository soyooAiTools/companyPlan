import { AsyncLocalStorage } from "node:async_hooks";
import mysql from "mysql2/promise";

const transactionStore = new AsyncLocalStorage();

export async function createDatabase(config) {
  if (config.createDatabase) {
    const bootstrapPool = mysql.createPool({
      ...basePoolConfig(config),
      database: undefined,
      connectionLimit: 1,
      multipleStatements: false,
    });
    try {
      await bootstrapPool.query(
        `CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(config.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    } finally {
      await bootstrapPool.end();
    }
  }

  const pool = mysql.createPool({
    ...basePoolConfig(config),
    database: config.database,
    namedPlaceholders: true,
    multipleStatements: true,
  });

  const runQuery = async (sql, params = []) => {
    const connection = transactionStore.getStore() ?? pool;
    return connection.query(normalizeSql(sql), params);
  };

  return {
    database: config.database,

    async query(sql, params = []) {
      const [rows] = await runQuery(sql, params);
      return rows;
    },

    async exec(sql) {
      await runQuery(sql);
    },

    prepare(sql) {
      const normalizedSql = normalizeSql(sql);
      return {
        async all(...args) {
          const [rows] = await runQuery(normalizedSql, normalizeArgs(args));
          return rows;
        },

        async get(...args) {
          const [rows] = await runQuery(normalizedSql, normalizeArgs(args));
          return rows[0];
        },

        async run(...args) {
          const [result] = await runQuery(normalizedSql, normalizeArgs(args));
          return result;
        },
      };
    },

    async transaction(fn) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const result = await transactionStore.run(connection, fn);
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async columnExists(tableName, columnName) {
      const rows = await this.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
         LIMIT 1`,
        [tableName, columnName]
      );
      return rows.length > 0;
    },

    async indexExists(tableName, indexName) {
      const rows = await this.query(
        `SELECT 1
         FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
         LIMIT 1`,
        [tableName, indexName]
      );
      return rows.length > 0;
    },

    async close() {
      await pool.end();
    },
  };
}

function basePoolConfig(config) {
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    waitForConnections: true,
    connectionLimit: config.connectionLimit,
    // 用 collation 名而非裸 "utf8mb4"——mysql2 不认裸 "utf8mb4" 会回退 utf8mb3,导致 4 字节(emoji)写入报 1366。
    charset: "utf8mb4_unicode_ci",
    decimalNumbers: true,
    supportBigNumbers: true,
  };
}

function normalizeSql(sql) {
  return String(sql).replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, ":$1");
}

function normalizeArgs(args) {
  if (args.length === 0) return [];
  if (args.length === 1 && isPlainObject(args[0])) return args[0];
  return args;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !Buffer.isBuffer(value);
}

function escapeIdentifier(value) {
  return `\`${String(value).replace(/`/g, "``")}\``;
}
