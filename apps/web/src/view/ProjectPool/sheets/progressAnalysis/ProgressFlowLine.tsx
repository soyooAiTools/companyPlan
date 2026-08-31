import type { CSSProperties } from "react";
import { Tooltip } from "antd";
import dayjs from "dayjs";
import { PROJECT_STAGES, statusStyle } from "@/view/Ops/constants";
import type { ProgressFlowEvent } from "./progressAnalysisUtils";

type FlowMode = "status" | "stage";

type FlowStepState = "past" | "current" | "future" | "terminal";

type FlowStep = {
	key: string;
	label: string;
	state: FlowStepState;
	color: string;
	background: string;
	textColor: string;
	currentPulse?: boolean;
	event?: ProgressFlowEvent;
	durationToNext?: string;
	delayText?: string;
	createdAt?: string;
};

type StageDeadline = { key?: string; name?: string; date?: string };

const TERMINAL_STATUSES = new Set(["已完成", "回收中", "结算完成"]);

const STATE_COLOR: Record<FlowStepState, string> = {
	past: "#10b981",
	current: "#3b82f6",
	future: "#cbd5e1",
	terminal: "#dc2626",
};

const STATE_BACKGROUND: Record<FlowStepState, string> = {
	past: "#d1fae5",
	current: "#dbeafe",
	future: "#e5e7eb",
	terminal: "#fef2f2",
};

const STATE_TEXT: Record<FlowStepState, string> = {
	past: "#000000",
	current: "#000000",
	future: "#94a3b8",
	terminal: "#000000",
};

function cleanValue(value?: string | null) {
	return String(value || "").trim().replace(/^\$+/, "");
}

function stageDeadlineTime(stageDeadlines: StageDeadline[] | undefined, stage: string) {
	const deadline = (stageDeadlines || []).find((item) => item.name === stage || item.key === stage);
	if (!deadline?.date) return "";
	const date = dayjs(deadline.date);
	return date.isValid() ? date.format("MM/DD") : deadline.date;
}

function FlowEventTooltip({ step }: { step: FlowStep }) {
	const event = step.event;
	const fromStatus = event?.fromStatus || "—";
	const toStatus = event?.toStatus || step.label;
	return (
		<div className="progress-analysis-tooltip">
			{event ? (
				<div className="progress-analysis-tooltip-title">
					<span className="progress-analysis-tooltip-actor">{event.actorName || "系统"}：</span>
					<span className="progress-analysis-tooltip-status" style={statusStyle(fromStatus)}>
						{fromStatus}
					</span>
					<span className="progress-analysis-tooltip-arrow">-&gt;</span>
					<span className="progress-analysis-tooltip-status" style={statusStyle(toStatus)}>
						{toStatus}
					</span>
				</div>
			) : (
				<div className="progress-analysis-tooltip-title">{step.label}</div>
			)}
			{step.createdAt ? <div>修改时间：{step.createdAt}</div> : null}
			{step.delayText ? <div className="progress-analysis-tooltip-warn">{step.delayText}</div> : null}
		</div>
	);
}

function FlowNode({ step }: { step: FlowStep }) {
	const tooltipTitle = step.state === "future" && !step.event ? null : <FlowEventTooltip step={step} />;
	return (
		<span className={`progress-analysis-flow-node-wrap progress-analysis-flow-node-wrap-${step.state}`}>
			{step.delayText ? <b className="progress-analysis-flow-delay-top">{step.delayText}</b> : null}
			<Tooltip
				title={tooltipTitle}
				color="#fff"
				styles={{
					container: { boxShadow: "0 10px 26px rgba(15, 23, 42, 0.14)", border: "1px solid #e2e8f0" },
				}}>
				<span
					className={`progress-analysis-flow-node progress-analysis-flow-node-${step.state}`}
					style={
						{
							"--flow-accent": step.color,
							"--flow-bg": step.background,
							"--flow-text": step.textColor,
						} as CSSProperties
					}>
					{step.currentPulse ? <span className="progress-analysis-flow-current-flag" /> : null}
					<span className="progress-analysis-flow-node-text">{step.label}</span>
				</span>
			</Tooltip>
			{step.createdAt ? <span className="progress-analysis-flow-node-time">{step.createdAt}</span> : null}
		</span>
	);
}

function FlowConnector({ duration, visible, state }: { duration?: string; visible: boolean; state: FlowStepState }) {
	if (!duration && !visible) return null;
	return (
		<span className={`progress-analysis-flow-edge progress-analysis-flow-edge-${state}${duration ? "" : " progress-analysis-flow-edge-empty"}`}>
			{duration ? <span>{duration}</span> : null}
		</span>
	);
}

function buildStatusSteps(events: ProgressFlowEvent[], currentStatus?: string): FlowStep[] {
	const cleanCurrent = cleanValue(currentStatus);
	const baseEvents = events.length
		? events
		: cleanCurrent
			? [
					{
						id: `current-status-${cleanCurrent}`,
						kind: "status" as const,
						label: cleanCurrent,
						color: STATE_COLOR.current,
						textColor: "#0f172a",
						fromStatus: "",
						toStatus: cleanCurrent,
						actorName: "",
						createdAt: "",
					},
				]
			: [];
	return baseEvents.map((event, index) => {
		const label = cleanValue(event.toStatus || event.label);
		const previousEvent = baseEvents[index - 1];
		const previousLabel = previousEvent ? cleanValue(previousEvent.toStatus || previousEvent.label) : "";
		const isLast = index === baseEvents.length - 1;
		const terminal = isLast && TERMINAL_STATUSES.has(label);
		const state: FlowStepState = terminal ? "terminal" : isLast ? "current" : "past";
		const statusColor = statusStyle(label);
		const tooltipEvent = previousLabel ? { ...event, fromStatus: previousLabel } : event;
		return {
			key: event.id,
			label,
			state,
			color: event.color || STATE_COLOR.current,
			background: String(statusColor.background || STATE_BACKGROUND[state]),
			textColor: String(statusColor.color || event.textColor || "#0f172a"),
			event: tooltipEvent,
			durationToNext: event.durationToNext,
			createdAt: event.createdAt,
		};
	});
}

function buildStageSteps(events: ProgressFlowEvent[], currentStage?: string, stageDeadlines?: StageDeadline[]): FlowStep[] {
	const eventByStage = new Map(events.map((event) => [cleanValue(event.toStatus), event]));
	const cleanCurrent = cleanValue(currentStage);
	const eventStageIndex = Math.max(...events.map((event) => PROJECT_STAGES.indexOf(cleanValue(event.toStatus))).filter((index) => index >= 0), -1);
	const currentIndex = PROJECT_STAGES.indexOf(cleanCurrent);
	const activeIndex = currentIndex >= 0 ? currentIndex : eventStageIndex;
	return PROJECT_STAGES.map((stage, index) => {
		const event = eventByStage.get(stage);
		const state: FlowStepState = activeIndex < 0 ? "future" : index < activeIndex ? "past" : index === activeIndex ? "current" : "future";
		return {
			key: `stage-${stage}`,
			label: stage,
			state,
			color: STATE_COLOR[state],
			background: STATE_BACKGROUND[state],
			textColor: STATE_TEXT[state],
			currentPulse: state === "current",
			event,
			durationToNext: event?.durationToNext,
			delayText: event?.delayText,
			createdAt: event?.createdAt || stageDeadlineTime(stageDeadlines, stage),
		};
	});
}

export default function ProgressFlowLine({ mode, events, currentStatus, currentStage, stageDeadlines }: { mode: FlowMode; events: ProgressFlowEvent[]; currentStatus?: string; currentStage?: string; stageDeadlines?: StageDeadline[] }) {
	const steps = mode === "status" ? buildStatusSteps(events, currentStatus) : buildStageSteps(events, currentStage, stageDeadlines);
	if (!steps.length) return <span className="progress-analysis-empty-flow">—</span>;
	return (
		<div className={`progress-analysis-flow progress-analysis-flow-${mode}`}>
			{steps.map((step, index) => (
				<span key={step.key} className="progress-analysis-flow-part">
					<FlowNode step={step} />
					<FlowConnector duration={step.durationToNext} visible={index < steps.length - 1} state={step.state} />
				</span>
			))}
		</div>
	);
}
