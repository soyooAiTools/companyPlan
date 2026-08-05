import { useEffect, useRef, useState } from "react";
import { Form, Modal } from "antd";
import type { MessageInstance } from "antd/es/message/interface";
import { opsApi } from "@/api/modules/ops";
import type { OpsProject, OpsProjectPoolMember, OpsProjectPoolRow, OpsResponsibleMember, OpsResponsibleSegment, OpsTenant } from "@/api/modules/ops";
import CreateTicketModal from "@/view/Tickets/components/dialogs/CreateTicketModal";
import { stripHtmlText } from "@/view/Tickets/ticketsUtils";

type ProjectPoolCreateTicketModalProps = {
	open: boolean;
	project: OpsProjectPoolRow | null;
	member?: OpsProjectPoolMember | null;
	messageApi: MessageInstance;
	onCreated: () => Promise<void> | void;
	onCancel: () => void;
};

function versionScopedProjectId(project?: OpsProjectPoolRow | null) {
	const baseId = String(project?.projectId || project?.parentId || project?.id || "");
	if (!baseId || baseId.includes("::version-")) return baseId;
	return project?.versionId ? `${baseId}::version-${project.versionId}` : baseId;
}

function projectTenantId(project?: OpsProjectPoolRow | null) {
	const tenantId = project?.tenantId;
	return tenantId == null || tenantId === "" ? "" : String(tenantId);
}

export default function ProjectPoolCreateTicketModal({ open, project, member, messageApi, onCreated, onCancel }: ProjectPoolCreateTicketModalProps) {
	const [form] = Form.useForm();
	const [submitting, setSubmitting] = useState(false);
	const [tenants, setTenants] = useState<OpsTenant[]>([]);
	const [projects, setProjects] = useState<OpsProject[]>([]);
	const [projectsLoading, setProjectsLoading] = useState(false);
	const [segments, setSegments] = useState<OpsResponsibleSegment[]>([]);
	const [members, setMembers] = useState<OpsResponsibleMember[]>([]);
	const [invalidTaskIndex, setInvalidTaskIndex] = useState<number | null>(null);
	const selectedProjectId = Form.useWatch("projectId", form) as string | undefined;
	const selectedVersionId = Form.useWatch("projectVersionId", form) as string | undefined;
	const projectsRequestSeq = useRef(0);
	const selectedProject = projects.find((item) => String(item.id) === String(selectedProjectId));
	const selectedVersion = selectedProject?.versions?.find((version) => String(version.id) === String(selectedVersionId));

	const clickedVersion = project?.versionId
		? {
				id: project.versionId,
				code: project.versionCode || "",
				name: project.versionName || "",
		}
		: null;

	const defaultVersionId = (item?: OpsProject | null) =>
		(item?.versions || []).find((version) => version.isDefault || String(version.code || "").toLowerCase() === "v1")?.id || item?.versions?.[0]?.id;
	const versionProjectId = (projectId?: string, versionId?: string) => {
		if (!projectId) return "";
		if (projectId.includes("::version-")) return projectId;
		return versionId ? `${projectId}::version-${versionId}` : projectId;
	};

	const fillInitialMember = (nextSegments: OpsResponsibleSegment[], nextMembers: OpsResponsibleMember[]) => {
		if (!member) return;
		const target = nextMembers.find((item) => String(item.id) === String(member.id));
		if (!target) return;
		const segmentId =
			target.segmentIds?.[0] ??
			nextSegments.find((segment) => (member.tags || []).some((tag) => tag === segment.name))?.id;
		form.setFieldValue(["tickets", 0, "ownerId"], target.id);
		if (segmentId != null) form.setFieldValue(["tickets", 0, "segmentId"], segmentId);
	};

	const loadResponsibles = async (projectId?: string) => {
		setSegments([]);
		setMembers([]);
		if (!projectId) return;
		const r = await opsApi.responsibles(projectId).catch(() => null);
		if (r) {
			const nextSegments = r.segments ?? [];
			const nextMembers = r.members ?? [];
			setSegments(nextSegments);
			setMembers(nextMembers);
			fillInitialMember(nextSegments, nextMembers);
		}
	};

	useEffect(() => {
		if (!open) return;
		let active = true;
		const init = async () => {
			form.resetFields();
			form.setFieldsValue({ priority: "普通", tickets: [{}] });
			setInvalidTaskIndex(null);
			setProjects([]);
			setProjectsLoading(false);
			setSegments([]);
			setMembers([]);
			const tn = await opsApi.tenants().catch(() => null);
			if (!active) return;
			const nextTenants = tn?.tenants ?? [];
			const tenantId = projectTenantId(project);
			if (tenantId && project?.tenantName && !nextTenants.some((tenant) => String(tenant.id) === tenantId)) {
				nextTenants.unshift({ id: tenantId, name: project.tenantName });
			}
			setTenants(nextTenants);
			if (!project) return;
			const fallbackProject: OpsProject = {
				id: project.id,
				name: project.name,
				tenantId,
				client: project.tenantName || "",
				plannerName: project.plannerName || "",
				developerName: "",
				status: project.status || "",
			};
			setProjects([fallbackProject]);
			form.setFieldsValue({ tenantId: tenantId || undefined, projectId: project.id, projectVersionId: clickedVersion?.id || defaultVersionId(fallbackProject), priority: "普通", tickets: [{}] });
			void loadResponsibles(versionScopedProjectId(project));
			const allProjects = await opsApi.projects(tenantId).catch(() => null);
			if (!active || !allProjects) return;
			const current = allProjects.projects.find((item) => String(item.id) === String(project.id));
			const resolvedTenantId = tenantId || (current?.tenantId ? String(current.tenantId) : "");
			if (resolvedTenantId && !tenantId) form.setFieldValue("tenantId", resolvedTenantId);
			const nextProjects = resolvedTenantId ? allProjects.projects.filter((item) => String(item.tenantId) === resolvedTenantId) : allProjects.projects;
			const syncedProject = nextProjects.find((item) => String(item.id) === String(project.id));
			const syncedVersionId = clickedVersion?.id || defaultVersionId(syncedProject);
			if (syncedVersionId) form.setFieldValue("projectVersionId", syncedVersionId);
			setProjects(nextProjects);
		};
		void init();
		return () => {
			active = false;
		};
	}, [form, member, open, project]);

	const onTenantChange = async (tenantId?: string) => {
		const seq = ++projectsRequestSeq.current;
		form.setFieldsValue({ projectId: undefined, projectVersionId: undefined, tickets: [{}] });
		setProjects([]);
		setSegments([]);
		setMembers([]);
		if (!tenantId) {
			setProjectsLoading(false);
			return;
		}
		setProjectsLoading(true);
		const r = await opsApi.projects(tenantId).catch(() => null);
		if (seq !== projectsRequestSeq.current) return;
		if (r) setProjects(r.projects);
		setProjectsLoading(false);
	};

	const onProjectChange = async (projectId?: string) => {
		const nextProject = projects.find((item) => String(item.id) === String(projectId));
		const nextVersionId = defaultVersionId(nextProject);
		form.setFieldsValue({ projectVersionId: nextVersionId, tickets: [{}] });
		await loadResponsibles(versionProjectId(projectId, nextVersionId));
	};

	const onVersionChange = async (versionId?: string) => {
		form.setFieldsValue({ tickets: [{}] });
		await loadResponsibles(versionProjectId(selectedProjectId, versionId));
	};

	const submit = async () => {
		await form.validateFields([["tenantId"], ["projectId"]]);
		const v = form.getFieldsValue();
		const rawTickets = (v.tickets || []) as Record<string, unknown>[];
		const hasAnyValue = (ticket: Record<string, unknown>) =>
			Boolean(String(ticket.title ?? "").trim() || ticket.segmentId != null || String(ticket.ownerId ?? "").trim() || stripHtmlText(String(ticket.contentHtml ?? "")));
		const isComplete = (ticket: Record<string, unknown>) => Boolean(String(ticket.title ?? "").trim() && ticket.segmentId != null && String(ticket.ownerId ?? "").trim());
		const incompleteIndex = rawTickets.findIndex((ticket) => hasAnyValue(ticket) && !isComplete(ticket));
		if (incompleteIndex >= 0) {
			const ticket = rawTickets[incompleteIndex];
			const ownerName = String(ticket.ownerId ?? "").trim() ? members.find((member) => member.id === String(ticket.ownerId))?.name || String(ticket.ownerId) : "未选负责人";
			const title = String(ticket.title ?? "").trim();
			const ticketLabel = `工单 ${incompleteIndex + 1}${ownerName ? `（${ownerName}${title ? ` · ${title}` : ""}）` : ""}`;
			setInvalidTaskIndex(incompleteIndex);
			form.setFields(
				[
					!String(ticket.title ?? "").trim() ? { name: ["tickets", incompleteIndex, "title"], errors: ["请输入标题"] } : null,
					ticket.segmentId == null ? { name: ["tickets", incompleteIndex, "segmentId"], errors: ["请选择环节"] } : null,
					!String(ticket.ownerId ?? "").trim() ? { name: ["tickets", incompleteIndex, "ownerId"], errors: ["请选择负责人"] } : null,
				].filter(Boolean) as Parameters<typeof form.setFields>[0],
			);
			messageApi.error(`${ticketLabel}：请补全标题、环节和负责人`);
			return;
		}
		setInvalidTaskIndex(null);
		const ticketsToCreate = rawTickets
			.filter(isComplete)
			.map((ticket) => ({
				projectId: versionProjectId(v.projectId, selectedVersion?.id),
				projectVersionId: selectedVersion?.id || "",
				projectVersionCode: selectedVersion?.code || "",
				projectVersionName: selectedVersion?.name || "",
				segmentId: Number(ticket.segmentId),
				ownerId: String(ticket.ownerId),
				title: String(ticket.title || "").trim(),
				priority: v.priority,
				contentHtml: String(ticket.contentHtml ?? ""),
			}));
		if (!ticketsToCreate.length) {
			messageApi.error("请至少填写一条完整工单");
			return;
		}
		setSubmitting(true);
		try {
			await opsApi.createTickets({ projectId: versionProjectId(v.projectId, selectedVersion?.id), priority: v.priority, tickets: ticketsToCreate });
			messageApi.success(ticketsToCreate.length > 1 ? `已创建 ${ticketsToCreate.length} 条工单` : "提单已创建");
			onCancel();
			await onCreated();
		} catch (e) {
			messageApi.error(e instanceof Error ? e.message : "建单失败");
		} finally {
			setSubmitting(false);
		}
	};

	const hasCreateDraft = () => {
		const v = form.getFieldsValue();
		const hasTicketDraft = (v.tickets || []).some((ticket: Record<string, unknown>) =>
			Boolean(String(ticket.title ?? "").trim() || ticket.segmentId != null || String(ticket.ownerId ?? "").trim() || stripHtmlText(String(ticket.contentHtml ?? ""))),
		);
		return Boolean((v.priority && v.priority !== "普通") || hasTicketDraft);
	};

	const closeCreate = () => {
		if (submitting) return;
		if (!hasCreateDraft()) {
			onCancel();
			return;
		}
		Modal.confirm({
			title: "确认关闭新建工单？",
			content: "当前已填写内容或需求说明，关闭后本次填写不会保存。",
			okText: "关闭",
			cancelText: "继续填写",
			okButtonProps: { danger: true },
			onOk: onCancel,
		});
	};

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
			onVersionChange={onVersionChange}
			invalidTaskIndex={invalidTaskIndex}
			onTenantChange={onTenantChange}
			onProjectChange={onProjectChange}
			onSubmit={submit}
			onCancel={closeCreate}
		/>
	);
}
