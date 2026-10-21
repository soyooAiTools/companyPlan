import { useEffect, useRef, useState } from "react";
import { App, Form, Modal } from "antd";
import { opsApi } from "../../../api/modules/ops";
import type { OpsProject, OpsResponsibleMember, OpsResponsibleSegment, OpsTenant } from "../../../api/modules/ops";
import { stripHtmlText } from "../../Tickets/ticketsUtils";
import CreateTicketModal from "../../Tickets/components/dialogs/CreateTicketModal";
import type { PeopleProgressRow } from "../types";

type PeopleAssignTicketModalProps = {
	open: boolean;
	person: PeopleProgressRow | null;
	onClose: () => void;
	onCreated: () => void;
};

export default function PeopleAssignTicketModal({ open, person, onClose, onCreated }: PeopleAssignTicketModalProps) {
	const { message } = App.useApp();
	const [form] = Form.useForm();
	const [submitting, setSubmitting] = useState(false);
	const [tenants, setTenants] = useState<OpsTenant[]>([]);
	const [projects, setProjects] = useState<OpsProject[]>([]);
	const [projectsLoading, setProjectsLoading] = useState(false);
	const [segments, setSegments] = useState<OpsResponsibleSegment[]>([]);
	const [members, setMembers] = useState<OpsResponsibleMember[]>([]);
	const [invalidTaskIndex, setInvalidTaskIndex] = useState<number | null>(null);
	const projectsRequestSeq = useRef(0);
	const selectedProjectId = Form.useWatch("projectId", form) as string | undefined;
	const selectedVersionId = Form.useWatch("projectVersionId", form) as string | undefined;
	const selectedProject = projects.find((project) => String(project.id) === String(selectedProjectId));
	const selectedVersion = selectedProject?.versions?.find((version) => String(version.id) === String(selectedVersionId));
	const selectedSegment = (segmentId?: unknown) => segments.find((segment) => String(segment.id) === String(segmentId));
	const resolveDueTime = (ticket: Record<string, unknown>, index: number) => {
		const fieldValue = ticket.dueInHours ?? form.getFieldValue(["tickets", index, "dueInHours"]);
		const segment = selectedSegment(ticket.segmentId);
		if (segment?.name === "制片") return Number(segment.defaultDeliveryHours ?? 1);
		return fieldValue;
	};
	const hasValidDueTime = (ticket: Record<string, unknown>, index: number) => {
		const hours = resolveDueTime(ticket, index);
		return Number.isInteger(Number(hours)) && Number(hours) >= 1 && Number(hours) <= 720;
	};
	const defaultVersionId = (project?: OpsProject) =>
		(project?.versions || []).find((version) => version.isDefault || String(version.code || "").toLowerCase() === "v1")?.id || project?.versions?.[0]?.id;
	const versionProjectId = (projectId?: string, versionId?: string) => (projectId && versionId ? `${projectId}::version-${versionId}` : projectId || "");

	const resetDraft = () => {
		form.resetFields();
		form.setFieldsValue({ priority: "普通", tickets: [{ ownerId: person?.userId }] });
		setInvalidTaskIndex(null);
		setProjects([]);
		setProjectsLoading(false);
		setSegments([]);
		setMembers([]);
	};

	const ensureTenants = async () => {
		if (tenants.length) return;
		const response = await opsApi.tenants().catch(() => null);
		if (response) setTenants(response.tenants);
	};

	const onTenantChange = async (tenantId?: string) => {
		const seq = ++projectsRequestSeq.current;
		form.setFieldsValue({ projectId: undefined, projectVersionId: undefined, tickets: [{ ownerId: person?.userId }] });
		setProjects([]);
		setSegments([]);
		setMembers([]);
		if (!tenantId) {
			setProjectsLoading(false);
			return;
		}
		setProjectsLoading(true);
		const response = await opsApi.projects(tenantId).catch(() => null);
		if (seq !== projectsRequestSeq.current) return;
		if (response) setProjects(response.projects);
		setProjectsLoading(false);
	};

	const onProjectChange = async (projectId?: string) => {
		const nextProject = projects.find((project) => String(project.id) === String(projectId));
		const nextVersionId = defaultVersionId(nextProject);
		form.setFieldsValue({ projectVersionId: nextVersionId, tickets: [{ ownerId: person?.userId }] });
		setSegments([]);
		setMembers([]);
		if (!projectId) return;
		const response = await opsApi.responsibles(versionProjectId(projectId, nextVersionId)).catch(() => null);
		if (response) {
			setSegments(response.segments ?? []);
			setMembers(response.members ?? []);
		}
	};
	const onVersionChange = async (versionId?: string) => {
		form.setFieldsValue({ tickets: [{ ownerId: person?.userId }] });
		setSegments([]);
		setMembers([]);
		if (!selectedProjectId) return;
		const response = await opsApi.responsibles(versionProjectId(selectedProjectId, versionId)).catch(() => null);
		if (response) {
			setSegments(response.segments ?? []);
			setMembers(response.members ?? []);
		}
	};

	const submit = async () => {
		await form.validateFields([["tenantId"], ["projectId"]]);
		const value = form.getFieldsValue(true);
		const rawTickets = (value.tickets || []) as Record<string, unknown>[];
		const hasAnyValue = (ticket: Record<string, unknown>) =>
			Boolean(String(ticket.title ?? "").trim() || ticket.segmentId != null || String(ticket.ownerId ?? "").trim() || ticket.dueInHours != null || stripHtmlText(String(ticket.contentHtml ?? "")));
		const isComplete = (ticket: Record<string, unknown>, index: number) =>
			Boolean(String(ticket.title ?? "").trim() && ticket.segmentId != null && String(ticket.ownerId ?? "").trim() && hasValidDueTime(ticket, index));
		const incompleteIndex = rawTickets.findIndex((ticket, index) => hasAnyValue(ticket) && !isComplete(ticket, index));
		if (incompleteIndex >= 0) {
			setInvalidTaskIndex(incompleteIndex);
			message.error(`工单 ${incompleteIndex + 1}：请补全标题、环节、负责人和期望完成时长`);
			return;
		}
		const tickets = rawTickets
			.map((ticket, index) => ({ ticket, index }))
			.filter(({ ticket, index }) => isComplete(ticket, index))
			.map(({ ticket, index }) => ({
				projectId: versionProjectId(value.projectId, selectedVersion?.id),
				projectVersionId: selectedVersion?.id || "",
				projectVersionCode: selectedVersion?.code || "",
				projectVersionName: selectedVersion?.name || "",
				segmentId: Number(ticket.segmentId),
				ownerId: String(ticket.ownerId),
				title: String(ticket.title || "").trim(),
				priority: value.priority,
				contentHtml: String(ticket.contentHtml ?? ""),
				dueInHours: resolveDueTime(ticket, index),
			}));
		if (!tickets.length) {
			message.error("请至少填写一条完整工单");
			return;
		}
		setSubmitting(true);
		try {
			await opsApi.createTickets({ projectId: versionProjectId(value.projectId, selectedVersion?.id), priority: value.priority, tickets });
			message.success(tickets.length > 1 ? `已创建 ${tickets.length} 条工单` : "提单已创建");
			onCreated();
			onClose();
		} catch (error) {
			message.error(error instanceof Error ? error.message : "建单失败");
		} finally {
			setSubmitting(false);
		}
	};

	const hasCreateDraft = () => {
		const value = form.getFieldsValue();
		const hasTicketDraft = (value.tickets || []).some((ticket: Record<string, unknown>) =>
			Boolean(String(ticket.title ?? "").trim() || ticket.segmentId != null || String(ticket.ownerId ?? "").trim() || stripHtmlText(String(ticket.contentHtml ?? ""))),
		);
		return Boolean(String(value.tenantId ?? "").trim() || String(value.projectId ?? "").trim() || (value.priority && value.priority !== "普通") || hasTicketDraft);
	};

	const cancel = () => {
		if (submitting) return;
		if (!hasCreateDraft()) {
			onClose();
			return;
		}
		Modal.confirm({
			title: "确认关闭新建工单？",
			content: "当前已填写内容，关闭后本次填写不会保存。",
			okText: "关闭",
			cancelText: "继续填写",
			okButtonProps: { danger: true },
			onOk: onClose,
		});
	};

	useEffect(() => {
		if (!open) return;
		resetDraft();
		void ensureTenants();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, person?.userId]);

	return (
		<CreateTicketModal
			open={open}
			submitting={submitting}
			form={form}
			tenants={tenants}
			projects={projects}
			projectsLoading={projectsLoading}
			segments={segments}
			members={members}
			selectedProjectId={selectedProjectId}
			selectedVersionId={selectedVersionId}
			invalidTaskIndex={invalidTaskIndex}
			onTenantChange={onTenantChange}
			onProjectChange={onProjectChange}
			onVersionChange={onVersionChange}
			onSubmit={submit}
			onCancel={cancel}
		/>
	);
}
