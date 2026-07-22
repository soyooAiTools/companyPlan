import { listPeopleProgress, listPeopleProgressRoles, listPersonProgressTickets } from "./services/people-progress.mjs";

export function registerPeopleProgressRoutes(app, { requireAuth, requireAdmin }) {
	app.get("/api/ops/people-progress/roles", requireAuth, requireAdmin, (_req, res) => {
		res.json({ roles: listPeopleProgressRoles() });
	});

	app.get("/api/ops/people-progress", requireAuth, requireAdmin, async (req, res, next) => {
		try {
			const rows = await listPeopleProgress({
				role: String(req.query.role || "all"),
				q: String(req.query.q || "").trim(),
				overdueOnly: req.query.overdueOnly === "1" || req.query.overdueOnly === "true",
				newcomerOnly: req.query.newcomerOnly === "1" || req.query.newcomerOnly === "true",
			});
			res.json({ rows });
		} catch (error) {
			next(error);
		}
	});

	app.get("/api/ops/people-progress/:userId/tickets", requireAuth, requireAdmin, async (req, res, next) => {
		try {
			const tickets = await listPersonProgressTickets({
				userId: req.params.userId,
				role: String(req.query.role || "all"),
				status: String(req.query.status || "all"),
				q: String(req.query.q || "").trim(),
			});
			res.json({ tickets });
		} catch (error) {
			next(error);
		}
	});
}
