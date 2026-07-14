import Redis from "ioredis";
import { redisConfig } from "../config/runtime.mjs";
import { logger } from "./logger.mjs";

let client = null;
let connectPromise = null;
let disabled = false;

export function isRedisEnabled() {
  return redisConfig.enabled && !disabled;
}

export async function getRedisClient() {
  if (!isRedisEnabled()) return null;
  if (client?.status === "ready") return client;
  if (connectPromise) return connectPromise;

  const connection = redisConfig.url || {
    host: redisConfig.host,
    port: redisConfig.port,
    db: redisConfig.db,
    ...(redisConfig.password ? { password: redisConfig.password } : {}),
  };

  client ||= new Redis(connection, {
    keyPrefix: redisConfig.keyPrefix,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      return Math.min(times * 100, 1000);
    },
  });

  client.on("error", (error) => {
    logger.warn("[redis] client error", { error: error?.message ?? String(error) });
  });

  connectPromise = client
    .connect()
    .then(() => {
      logger.info("[redis] connected", { keyPrefix: redisConfig.keyPrefix });
      return client;
    })
    .catch((error) => {
      logger.warn("[redis] disabled after connect failed", { error: error?.message ?? String(error) });
      disabled = true;
      client?.disconnect();
      client = null;
      return null;
    })
    .finally(() => {
      connectPromise = null;
    });

  return connectPromise;
}

export async function redisGetJson(key) {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    logger.warn("[redis] get json failed", { key, error: error?.message ?? String(error) });
    return null;
  }
}

export async function redisSetJson(key, value, ttlSeconds) {
  const redis = await getRedisClient();
  if (!redis) return false;
  try {
    const raw = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await redis.set(key, raw, "EX", ttlSeconds);
    } else {
      await redis.set(key, raw);
    }
    return true;
  } catch (error) {
    logger.warn("[redis] set json failed", { key, error: error?.message ?? String(error) });
    return false;
  }
}

export async function redisDel(key) {
  const redis = await getRedisClient();
  if (!redis) return false;
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    logger.warn("[redis] del failed", { key, error: error?.message ?? String(error) });
    return false;
  }
}

export async function redisDelPattern(pattern) {
  const redis = await getRedisClient();
  if (!redis) return false;
  try {
    let cursor = "0";
    let deleted = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", `${redisConfig.keyPrefix}${pattern}`, "COUNT", 100);
      cursor = nextCursor;
      const normalizedKeys = keys.map((key) => key.replace(redisConfig.keyPrefix, ""));
      if (normalizedKeys.length) deleted += await redis.del(...normalizedKeys);
    } while (cursor !== "0");
    return deleted >= 0;
  } catch (error) {
    logger.warn("[redis] del pattern failed", { pattern, error: error?.message ?? String(error) });
    return false;
  }
}
