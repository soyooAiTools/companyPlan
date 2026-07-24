import pino from "pino";

const logFormat = String(process.env.COMPANYPLAN_LOG_FORMAT || "pretty").toLowerCase();
const prettyTransport =
  logFormat === "json"
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: process.stdout.isTTY,
          translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      };

const rawLogger = pino({
  level: process.env.COMPANYPLAN_LOG_LEVEL || process.env.LOG_LEVEL || "info",
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: prettyTransport,
});

function normalizeMeta(metadata) {
  if (metadata == null) return undefined;
  if (metadata instanceof Error) return { err: metadata };
  if (typeof metadata === "object") return metadata;
  return { value: metadata };
}

function write(level, message, metadata) {
  const meta = normalizeMeta(metadata);
  if (meta) {
    rawLogger[level](meta, message);
    return;
  }
  rawLogger[level](message);
}

export const logger = {
  child(bindings) {
    return rawLogger.child(bindings);
  },

  info(message, metadata = undefined) {
    write("info", message, metadata);
  },

  warn(message, metadata = undefined) {
    write("warn", message, metadata);
  },

  error(error, metadata = undefined) {
    if (error instanceof Error) {
      rawLogger.error({ err: error, ...normalizeMeta(metadata) }, error.message);
      return;
    }
    write("error", String(error), metadata);
  },
};

export { rawLogger };
