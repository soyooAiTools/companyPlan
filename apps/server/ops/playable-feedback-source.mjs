// Source IDs come from persisted service-authenticated mappings, never from a
// browser-supplied permission claim. Preserve tenant selection for login.
export function buildPlayableFeedbackSourceUrl(sourceUrl, reviewId, assignmentId, ticketId = "") {
  if (!reviewId) return "";
  let url;
  try { url = new URL(sourceUrl); } catch { return ""; }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
  const query = new URLSearchParams();
  if (assignmentId) query.set("assignmentId", assignmentId);
  if (ticketId) query.set("ticketId", ticketId);
  url.hash = `/feedback/${encodeURIComponent(reviewId)}?${query}`;
  return url.toString();
}

export async function loadPlayableFeedbackSource(database, ticketId) {
  const rows = await database.$queryRawUnsafe(
    "SELECT source_review_id, source_review_number, source_assignment_id, source_url FROM ops_ticket_source_links WHERE source_system = ? AND ticket_id = ? LIMIT 1",
    "playable-feedback", ticketId,
  );
  const source = rows[0];
  if (!source) return null;
  const url = buildPlayableFeedbackSourceUrl(source.source_url, source.source_review_id, source.source_assignment_id, ticketId);
  return url ? { url, reviewId: source.source_review_id, reviewNumber: source.source_review_number, assignmentId: source.source_assignment_id } : null;
}

export function registerPlayableFeedbackSourceRoute(app, { requireAuth, database, getAccess, canView }) {
  app.get("/api/ops/tickets/:id/feedback-source", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const ticket = await database.tickets.findUnique({ where: { id }, select: { owner_id: true, requester_id: true } });
    if (!ticket) return res.status(404).json({ error: "提单不存在" });
    const access = await getAccess(req.user);
    if (!canView(access, ticket)) return res.status(403).json({ error: "无权查看" });
    res.json({ source: await loadPlayableFeedbackSource(database, id) });
  });
}
