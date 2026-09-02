import crypto from "node:crypto";
import { playableFeedbackIntegration } from "../config/runtime.mjs";

const seenNonces = new Map();

export function bodySha256(rawBody = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody ?? ""), "utf8");
  return crypto.createHash("sha256").update(body).digest("hex");
}

export function createPlayableFeedbackSignature({ timestamp, nonce, rawBody, secret }) {
  const canonical = `${timestamp}\n${nonce}\n${bodySha256(rawBody)}`;
  return `sha256=${crypto.createHmac("sha256", secret).update(canonical).digest("hex")}`;
}

export function safeSignatureEqual(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createPlayableFeedbackServiceAuth(config = playableFeedbackIntegration) {
  return (request, response, next) => {
    if (!config.sharedSecret) return response.status(503).json({ error: "反馈工单集成尚未配置" });

    const serviceId = String(request.headers["x-playable-service"] || "").trim();
    const timestamp = String(request.headers["x-playable-timestamp"] || "").trim();
    const nonce = String(request.headers["x-playable-nonce"] || "").trim();
    const signature = String(request.headers["x-playable-signature"] || "").trim();
    if (!serviceId || !timestamp || !nonce || !signature) {
      return response.status(401).json({ error: "缺少服务鉴权信息" });
    }
    if (serviceId !== config.serviceId) return response.status(403).json({ error: "服务身份不匹配" });
    if (!/^\d{10,13}$/.test(timestamp)) return response.status(401).json({ error: "服务时间戳不合法" });
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) return response.status(401).json({ error: "服务随机数不合法" });

    const rawTime = Number(timestamp);
    const requestTime = timestamp.length === 10 ? rawTime * 1000 : rawTime;
    const maxSkewMs = config.maxClockSkewSeconds * 1000;
    if (!Number.isFinite(requestTime) || Math.abs(Date.now() - requestTime) > maxSkewMs) {
      return response.status(401).json({ error: "服务请求已过期" });
    }

    const now = Date.now();
    for (const [key, expiresAt] of seenNonces) {
      if (expiresAt <= now) seenNonces.delete(key);
    }
    const nonceKey = `${serviceId}:${nonce}`;
    if (seenNonces.has(nonceKey)) return response.status(409).json({ error: "服务请求已重复" });

    const expected = createPlayableFeedbackSignature({
      timestamp,
      nonce,
      rawBody: request.rawBody || Buffer.alloc(0),
      secret: config.sharedSecret,
    });
    if (!safeSignatureEqual(signature, expected)) return response.status(401).json({ error: "服务签名无效" });

    seenNonces.set(nonceKey, now + maxSkewMs);
    request.playableFeedbackService = { serviceId };
    return next();
  };
}

export function clearPlayableFeedbackNonceCache() {
  seenNonces.clear();
}
