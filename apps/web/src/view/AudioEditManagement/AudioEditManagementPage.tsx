import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Card, Typography } from "antd";
import { opsApi, type OpsAudioEditSession } from "../../api/modules/ops";
import AudioEditToolbar from "./components/AudioEditToolbar";
import AudioEditTable from "./components/AudioEditTable";
import "./audioEditManagement.css";

export default function AudioEditManagementPage() {
	const { message } = App.useApp();
	const [rows, setRows] = useState<OpsAudioEditSession[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [status, setStatus] = useState("待替换");
	const [keyword, setKeyword] = useState("");
	const [debouncedKeyword, setDebouncedKeyword] = useState("");
	const [sortBy, setSortBy] = useState("");
	const [sortOrder, setSortOrder] = useState<"ascend" | "descend" | "">("");
	const [loading, setLoading] = useState(false);
	const requestSeqRef = useRef(0);

	const query = useMemo(
		() => {
			const effectiveSortOrder: "ascend" | "descend" | "" = sortOrder || (status === "已完成" ? "descend" : "");
			return {
				page,
				pageSize,
				status,
				q: debouncedKeyword.trim(),
				sortBy: sortBy || (status === "已完成" ? "completed_at" : ""),
				sortOrder: effectiveSortOrder,
			};
		},
		[page, pageSize, status, debouncedKeyword, sortBy, sortOrder],
	);

	const load = useCallback(async () => {
		const requestSeq = requestSeqRef.current + 1;
		requestSeqRef.current = requestSeq;
		const startedAt = Date.now();
		setLoading(true);
		try {
			const result = await opsApi.audioEditSessions(query);
			if (requestSeq !== requestSeqRef.current) return;
			setRows(result.rows || []);
			setTotal(result.total || 0);
		} catch (error) {
			if (requestSeq !== requestSeqRef.current) return;
			message.error(error instanceof Error ? error.message : "音效配置加载失败");
		} finally {
			const remaining = Math.max(0, 350 - (Date.now() - startedAt));
			window.setTimeout(() => {
				if (requestSeq === requestSeqRef.current) setLoading(false);
			}, remaining);
		}
	}, [message, query]);

	useEffect(() => {
		const timer = window.setTimeout(load, 220);
		return () => window.clearTimeout(timer);
	}, [load]);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			setDebouncedKeyword(keyword);
			setPage(1);
		}, 400);
		return () => window.clearTimeout(timer);
	}, [keyword]);

	useEffect(() => {
		const onVisible = () => {
			if (document.visibilityState === "visible") load();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => document.removeEventListener("visibilitychange", onVisible);
	}, [load]);

	const savePriority = async (row: OpsAudioEditSession, priority: number | null) => {
		try {
			const result = await opsApi.updateAudioEditPriority(row.id, priority);
			setRows((prev) => prev.map((item) => (item.id === row.id ? result.session : item)));
			message.success("优先级已保存");
		} catch (error) {
			message.error(error instanceof Error ? error.message : "优先级保存失败");
			throw error;
		}
	};

	const saveRemark = async (row: OpsAudioEditSession, remark: string) => {
		try {
			const result = await opsApi.updateAudioEditRemark(row.id, remark);
			setRows((prev) => prev.map((item) => (item.id === row.id ? result.session : item)));
			message.success("备注已保存");
		} catch (error) {
			message.error(error instanceof Error ? error.message : "备注保存失败");
			throw error;
		}
	};

	const saveStatus = async (row: OpsAudioEditSession, nextStatus: string, remark: string) => {
		try {
			const result = await opsApi.updateAudioEditStatus(row.id, nextStatus, remark);
			setRows((prev) => prev.map((item) => (item.id === row.id ? result.session : item)));
			message.success("状态已保存");
			load();
		} catch (error) {
			message.error(error instanceof Error ? error.message : "状态保存失败");
			throw error;
		}
	};

	return (
		<div className="audio-edit-page">
			<Card
				className="audio-edit-card"
				styles={{ body: { padding: 12, display: "flex", flexDirection: "column", minHeight: 0 } }}
				style={{ borderRadius: 8, height: "calc(100vh - 32px)" }}>
				<div className="audio-edit-page-header">
					<Typography.Title level={4} style={{ margin: 0, lineHeight: "28px" }}>
						音效配置管理
					</Typography.Title>
					<AudioEditToolbar
						status={status}
						keyword={keyword}
						loading={loading}
						onStatusChange={(value) => {
							setLoading(true);
							setStatus(value);
							if (value === "已完成") {
								setSortBy("completed_at");
								setSortOrder("descend");
							} else if (sortBy === "completed_at") {
								setSortBy("");
								setSortOrder("");
							}
							setPage(1);
						}}
						onKeywordChange={(value) => {
							setKeyword(value);
						}}
						onRefresh={load}
					/>
				</div>
				<AudioEditTable
					rows={rows}
					total={total}
					page={page}
					pageSize={pageSize}
					loading={loading}
					onPageChange={(nextPage, nextPageSize) => {
						setPage(nextPage);
						setPageSize(nextPageSize);
					}}
					sortBy={sortBy}
					sortOrder={sortOrder}
					onSortChange={(nextSortBy, nextSortOrder) => {
						setLoading(true);
						setSortBy(nextSortBy);
						setSortOrder(nextSortOrder);
						setPage(1);
					}}
					onPrioritySave={savePriority}
					onRemarkSave={saveRemark}
					onStatusSave={saveStatus}
				/>
			</Card>
		</div>
	);
}
