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
	const [loading, setLoading] = useState(false);
	const requestSeqRef = useRef(0);

	const query = useMemo(
		() => ({ page, pageSize, status }),
		[page, pageSize, status],
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
						loading={loading}
						onStatusChange={(value) => {
							setLoading(true);
							setStatus(value);
							setPage(1);
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
					onPrioritySave={savePriority}
					onRemarkSave={saveRemark}
				/>
			</Card>
		</div>
	);
}
