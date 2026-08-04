import { listAudioEditSessions, updateAudioEditPriority, updateAudioEditRemark } from "./services/ops-audio-edit.mjs";
import { soyooErrorResponse } from "./ops-helpers.mjs";

export function registerAudioEditRoutes(app, { requireAuth }) {
  app.get("/api/ops/audio-edit/sessions", requireAuth, async (req, res) => {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 20);
      const data = await listAudioEditSessions({
        page,
        pageSize,
        q: String(req.query.q ?? ""),
        status: String(req.query.status ?? ""),
      });
      res.json(data);
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  app.patch("/api/ops/audio-edit/sessions/:id/priority", requireAuth, async (req, res) => {
    try {
      const data = await updateAudioEditPriority(req.params.id, req.body?.priority);
      res.json(data);
    } catch (e) {
      if (e?.status === 400) {
        res.status(400).json({ error: e.message });
        return;
      }
      soyooErrorResponse(res, e);
    }
  });

  app.patch("/api/ops/audio-edit/sessions/:id/remark", requireAuth, async (req, res) => {
    try {
      const data = await updateAudioEditRemark(req.params.id, req.body?.remark);
      res.json(data);
    } catch (e) {
      if (e?.status === 400) {
        res.status(400).json({ error: e.message });
        return;
      }
      soyooErrorResponse(res, e);
    }
  });
}
