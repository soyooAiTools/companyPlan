import { soyooClient } from "./soyoo-client.mjs";
import { loadPlayableFeedbackSource } from "./playable-feedback-source.mjs";

function completionError(message, status = 409) {
	const error = new Error(message);
	error.status = status;
	return error;
}

// OPS is the final state-transition boundary. It reads the persisted ticket
// source rather than accepting a review/version identifier from the browser.
export async function assertPlayableFeedbackTicketCompletion(
	ticket,
	{ database, loadSource = loadPlayableFeedbackSource, loadVerificationStatus = soyooClient.playableFeedbackVerificationStatus } = {},
) {
	const source = await loadSource(database, String(ticket?.id || ""));
	if (!source?.reviewId) return null;

	const targetPlayableVersionId = String(ticket?.project_version_id || "").trim();
	if (!targetPlayableVersionId) {
		throw completionError("该录制反馈工单缺少试玩版本，无法确认反馈校验状态");
	}

	let verification;
	try {
		verification = await loadVerificationStatus(source.reviewId, targetPlayableVersionId);
	} catch (cause) {
		throw completionError(`暂时无法确认反馈校验状态，请稍后重试：${String(cause?.message || "服务不可用").slice(0, 180)}`, 502);
	}
	if (verification?.complete) return verification;

	const pendingCount = Math.max(0, Number(verification?.pendingCount) || 0);
	const feedbackCount = Math.max(pendingCount, Number(verification?.feedbackCount) || 0);
	throw completionError(`该版本还有 ${pendingCount || feedbackCount} 条反馈未完成校验，请等制片在反馈校验中逐条确认后再完成工单`);
}
