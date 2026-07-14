import { performance } from "node:perf_hooks";
import { logger } from "../../../core/logger.mjs";

export function createProjectPoolTimer(label, meta = {}) {
  const started = performance.now();
  let last = started;
  const steps = [];
  const mark = (name, extra = {}) => {
    const now = performance.now();
    steps.push({ name, ms: Math.round(now - last), ...extra });
    last = now;
  };
  const done = (extra = {}) => {
    const totalMs = Math.round(performance.now() - started);
    logger.info(`[ops-project-pool:${label}] done`, { totalMs, ...meta, ...extra, steps });
  };
  const error = (err) => {
    const totalMs = Math.round(performance.now() - started);
    logger.error(err, { label: `ops-project-pool:${label}`, totalMs, ...meta, steps });
  };
  return { mark, done, error };
}
