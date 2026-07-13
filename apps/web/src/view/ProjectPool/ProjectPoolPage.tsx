import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { App } from "antd";
import ChangeProjectFieldModal from "./components/dialogs/ChangeProjectFieldModal";
import MembersModal from "./components/dialogs/MembersModal";
import ProjectLogsDrawer from "./components/dialogs/ProjectLogsDrawer";
import RemarkModal from "./components/dialogs/RemarkModal";
import SegmentTicketDetailDrawer from "./components/dialogs/SegmentTicketDetailDrawer";
import SegmentTicketsModal from "./components/dialogs/SegmentTicketsModal";
import StageDeadlineModal from "./components/dialogs/StageDeadlineModal";
import ProjectPoolTable from "./components/table/ProjectPoolTable";
import ProjectPoolToolbar from "./components/toolbar/ProjectPoolToolbar";
import { useProjectPoolColumns } from "./hooks/useProjectPoolColumns";
import { useProjectPoolData } from "./hooks/useProjectPoolData";
import { useProjectPoolModals } from "./hooks/useProjectPoolModals";

dayjs.locale("zh-cn");

export default function ProjectPoolPage() {
	const { message } = App.useApp();
	const {
		tab,
		setTab,
		rows,
		total,
		page,
		setPage,
		pageSize,
		setPageSize,
		loading,
		search,
		setSearch,
		statusFilter,
		setStatusFilter,
		stageFilter,
		setStageFilter,
		segmentFilter,
		setSegmentFilter,
		segmentOptions,
		load,
	} = useProjectPoolData(message);
	const dialogs = useProjectPoolModals(message, load);

	// 表格内部滚动高度:实测「表格区域」高度 − 表头/分页固定占位,做到分页精准贴底(自适应工具栏换行/各种屏高)
	const tableWrapRef = useRef<HTMLDivElement>(null);
	const [scrollY, setScrollY] = useState(420);
	useEffect(() => {
		const el = tableWrapRef.current;
		if (!el) return;
		const FIXED = 112; // 表头(~46)+ 分页(~56)+ 余量
		const update = () => setScrollY(Math.max(160, el.clientHeight - FIXED));
		update();
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// 通知深链:URL 带 ?project=<id> 时,在已加载的项目里找到它并打开流转抽屉(找到即打开并清掉参数)
	const [searchParams, setSearchParams] = useSearchParams();
	const projectParam = searchParams.get("project");
	useEffect(() => {
		if (!projectParam || !rows.length) return;
		const row = rows.find((r) => r.id === projectParam);
		if (row) {
			void dialogs.actions.openLogs(row);
			searchParams.delete("project");
			setSearchParams(searchParams, { replace: true });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [projectParam, rows]);

	const columns = useProjectPoolColumns(dialogs.actions);

	return (
		<div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 32px)" }}>
			<ProjectPoolToolbar
				tab={tab}
				search={search}
				statusFilter={statusFilter}
				stageFilter={stageFilter}
				segmentFilter={segmentFilter}
				segmentOptions={segmentOptions}
				onTabChange={(value) => {
					setTab(value);
					setPage(1);
				}}
				onSearchChange={setSearch}
				onStatusFilterChange={(value) => {
					setStatusFilter(value);
					setPage(1);
				}}
				onStageFilterChange={(value) => {
					setStageFilter(value);
					setPage(1);
				}}
				onSegmentFilterChange={(value) => {
					setSegmentFilter(value);
					setPage(1);
				}}
			/>

			{/* 表格区域:flex 填满剩余高度,内部滚动(表头固定、分页贴底) */}
			<div ref={tableWrapRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
				<ProjectPoolTable
					rows={rows}
					columns={columns}
					loading={loading}
					page={page}
					pageSize={pageSize}
					total={total}
					scrollY={scrollY}
					onPageChange={(nextPage, nextPageSize) => {
						setPage(nextPage);
						setPageSize(nextPageSize);
					}}
					onOpenLogs={dialogs.actions.openLogs}
				/>
			</div>

			<ChangeProjectFieldModal
				open={dialogs.change.open}
				field={dialogs.change.field}
				target={dialogs.change.target}
				value={dialogs.change.value}
				comment={dialogs.change.comment}
				saving={dialogs.change.saving}
				onValueChange={dialogs.change.setValue}
				onCommentChange={dialogs.change.setComment}
				onConfirm={dialogs.change.confirm}
				onCancel={dialogs.change.close}
			/>
			<RemarkModal
				open={dialogs.remark.open}
				target={dialogs.remark.target}
				value={dialogs.remark.value}
				saving={dialogs.remark.saving}
				onChange={dialogs.remark.setValue}
				onSave={dialogs.remark.save}
				onCancel={dialogs.remark.close}
			/>
			<StageDeadlineModal
				open={dialogs.deadline.open}
				target={dialogs.deadline.target}
				rows={dialogs.deadline.rows}
				auto={dialogs.deadline.auto}
				skipWeekend={dialogs.deadline.skipWeekend}
				intervals={dialogs.deadline.intervals}
				saving={dialogs.deadline.saving}
				onAutoChange={dialogs.deadline.setAuto}
				onSkipWeekendChange={dialogs.deadline.changeSkipWeekend}
				onIntervalChange={dialogs.deadline.changeInterval}
				onDateChange={dialogs.deadline.changeDate}
				onSave={dialogs.deadline.save}
				onCancel={dialogs.deadline.close}
			/>
			<ProjectLogsDrawer
				open={dialogs.logs.open}
				project={dialogs.logs.project}
				logs={dialogs.logs.rows}
				loading={dialogs.logs.loading}
				logKind={dialogs.logs.kind}
				onLogKindChange={dialogs.logs.setKind}
				onClose={dialogs.logs.close}
			/>
			<MembersModal
				open={dialogs.members.open}
				project={dialogs.members.project}
				members={dialogs.members.rows}
				loading={dialogs.members.loading}
				onCancel={dialogs.members.close}
			/>
			<SegmentTicketsModal
				open={dialogs.segmentTickets.open}
				title={dialogs.segmentTickets.title}
				segments={dialogs.segmentTickets.tabs}
				activeSegmentId={dialogs.segmentTickets.segmentId}
				tickets={dialogs.segmentTickets.tickets}
				loading={dialogs.segmentTickets.loading}
				onCancel={dialogs.segmentTickets.close}
				onSegmentChange={dialogs.segmentTickets.switchTab}
				onOpenTicket={dialogs.actions.openSegTicketDetail}
			/>
			<SegmentTicketDetailDrawer
				open={dialogs.segmentTicketDetail.open}
				ticket={dialogs.segmentTicketDetail.ticket}
				events={dialogs.segmentTicketDetail.events}
				loading={dialogs.segmentTicketDetail.loading}
				onClose={dialogs.segmentTicketDetail.close}
			/>
		</div>
	);
}
