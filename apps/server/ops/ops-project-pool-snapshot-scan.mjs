import { projectPoolSnapshotSyncIntervalMinutes } from "../config/runtime.mjs";
import { rebuildProjectPoolSnapshots } from "./services/ops-project-pool.mjs";

let running = false;

async function runOnce(logger) {
  if (running) return;
  running = true;
  try {
    const count = await rebuildProjectPoolSnapshots();
    logger?.info?.("[project-pool-scan] snapshot refreshed", { projects: count });
  } catch (error) {
    logger?.error?.("[project-pool-scan] snapshot refresh failed", { error });
  } finally {
    running = false;
  }
}

export function startProjectPoolSnapshotScan({ logger } = {}) {
  if (projectPoolSnapshotSyncIntervalMinutes <= 0) {
    logger?.info?.("[project-pool-scan] disabled");
    return null;
  }

  const intervalMs = projectPoolSnapshotSyncIntervalMinutes * 60 * 1000;
  const loop = async () => {
    await runOnce(logger);
    setTimeout(loop, intervalMs).unref?.();
  };
  const timer = setTimeout(loop, 5000);
  timer.unref?.();
  logger?.info?.("[project-pool-scan] started", { intervalMs });
  return timer;
}
