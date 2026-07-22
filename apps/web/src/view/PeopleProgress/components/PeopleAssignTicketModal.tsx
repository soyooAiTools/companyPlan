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
		form.setFieldsValue({ projectId: undefined, tickets: [{ ownerId: person?.userId }] });
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
		form.setFieldsValue({ tickets: [{ ownerId: person?.userId }] });
		setSegments([]);
		setMembers([]);
		if (!projectId) return;
		const response = await opsApi.responsibles(projectId).catch(() => null);
		if (response) {
			setSegments(response.segments ?? []);
			setMembers(response.members ?? []);
		}
	};

	const submit = async () => {
		await form.validateFields([["tenantId"], ["projectId"]]);
		const value = form.getFieldsValue();
		const rawTickets = (value.tickets || []) as Record<string, unknown>[];
		const hasAnyValue = (ticket: Record<string, unknown>) =>
			Boolean(String(ticket.title ?? "").trim() || ticket.segmentId != null || String(ticket.ownerId ?? "").trim() || stripHtmlText(String(ticket.contentHtml ?? "")));
		const isComplete = (ticket: Record<string, unknown>) => Boolean(String(ticket.title ?? "").trim() && ticket.segmentId != null && String(ticket.ownerId ?? "").trim());
		const incompleteIndex = rawTickets.findIndex((ticket) => hasAnyValue(ticket) && !isComplete(ticket));
		if (incompleteIndex >= 0) {
			setInvalidTaskIndex(incompleteIndex);
			message.error(`工单 ${incompleteIndex + 1}：请补全标题、环节和负责人`);
			return;
		}
		const tickets = rawTickets
			.filter(isComplete)
			.map((ticket) => ({
				projectId: value.projectId,
				segmentId: Number(ticket.segmentId),
				ownerId: String(ticket.ownerId),
				title: String(ticket.title || "").trim(),
				priority: value.priority,
				contentHtml: String(ticket.contentHtml ?? ""),
			}));
		if (!tickets.length) {
			message.error("请至少填写一条完整工单");
			return;
		}
		setSubmitting(true);
		try {
			await opsApi.createTickets({ projectId: value.projectId, priority: value.priority, tickets });
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
			invalidTaskIndex={invalidTaskIndex}
			onTenantChange={onTenantChange}
			onProjectChange={onProjectChange}
			onSubmit={submit}
			onCancel={cancel}
		/>
	);
}
