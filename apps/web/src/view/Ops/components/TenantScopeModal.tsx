import { useEffect, useMemo, useState } from "react";
import { Modal, Radio, Select, Tag, Typography, message } from "antd";
import { opsApi, type OpsTenantScope } from "../../../api/modules/ops";

type ScopeMode = OpsTenantScope["mode"];
type LimitedScopeMode = Exclude<ScopeMode, "all">;
type TenantScopeDrafts = Record<LimitedScopeMode, string[]>;

interface TenantScopeModalProps {
	open: boolean;
	onCancel: () => void;
}

const TENANT_SCOPE_DRAFTS_KEY = "ops.tenantScope.drafts.v1";
const LIMITED_SCOPE_MODES = new Set<ScopeMode>(["include", "exclude"]);
const DEFAULT_TENANT_SCOPE_DRAFTS: TenantScopeDrafts = { include: [], exclude: [] };

function normalizeTenantIds(value: unknown) {
	return Array.isArray(value) ? [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))] : [];
}

function readTenantScopeDrafts(): TenantScopeDrafts {
	if (typeof window === "undefined") return DEFAULT_TENANT_SCOPE_DRAFTS;
	try {
		const stored = JSON.parse(window.localStorage.getItem(TENANT_SCOPE_DRAFTS_KEY) || "{}") as Partial<TenantScopeDrafts>;
		return {
			include: normalizeTenantIds(stored.include),
			exclude: normalizeTenantIds(stored.exclude),
		};
	} catch {
		return DEFAULT_TENANT_SCOPE_DRAFTS;
	}
}

function writeTenantScopeDrafts(value: TenantScopeDrafts) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(TENANT_SCOPE_DRAFTS_KEY, JSON.stringify(value));
}

export default function TenantScopeModal({ open, onCancel }: TenantScopeModalProps) {
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [scope, setScope] = useState<OpsTenantScope | null>(null);
	const [mode, setMode] = useState<ScopeMode>("all");
	const [tenantIds, setTenantIds] = useState<string[]>([]);
	const [tenantScopeDrafts, setTenantScopeDrafts] = useState<TenantScopeDrafts>(readTenantScopeDrafts);
	const tenantNameById = useMemo(() => new Map((scope?.tenants || []).map((tenant) => [String(tenant.id), tenant.name])), [scope?.tenants]);
	const selectedTenants = useMemo(() => tenantIds.map((id) => ({ id, name: tenantNameById.get(id) || id })), [tenantIds, tenantNameById]);

	const saveDrafts = (nextDrafts: TenantScopeDrafts) => {
		setTenantScopeDrafts(nextDrafts);
		writeTenantScopeDrafts(nextDrafts);
	};

	const rememberCurrentMode = (currentMode: ScopeMode, currentTenantIds: string[]) => {
		if (!LIMITED_SCOPE_MODES.has(currentMode)) return tenantScopeDrafts;
		const nextDrafts = { ...tenantScopeDrafts, [currentMode]: normalizeTenantIds(currentTenantIds) };
		saveDrafts(nextDrafts);
		return nextDrafts;
	};

	useEffect(() => {
		if (!open) return;
		let disposed = false;
		setLoading(true);
		opsApi
			.tenantScope()
			.then((result) => {
				if (disposed) return;
				const nextScope = result.scope;
				const nextMode = nextScope.mode || "all";
				const nextTenantIds = normalizeTenantIds(nextScope.tenantIds || []);
				const storedDrafts = readTenantScopeDrafts();
				const nextDrafts = LIMITED_SCOPE_MODES.has(nextMode)
					? { ...storedDrafts, [nextMode]: nextTenantIds }
					: storedDrafts;
				setScope(nextScope);
				setMode(nextMode);
				setTenantIds(nextTenantIds);
				saveDrafts(nextDrafts);
			})
			.catch((error) => {
				if (!disposed) message.error(error instanceof Error ? error.message : "客户范围加载失败");
			})
			.finally(() => {
				if (!disposed) setLoading(false);
			});
		return () => {
			disposed = true;
		};
	}, [open]);

	const addTenantIds = (ids: string[]) => {
		setTenantIds((current) => {
			const nextTenantIds = normalizeTenantIds([...current, ...ids.map(String)]);
			if (LIMITED_SCOPE_MODES.has(mode)) {
				saveDrafts({ ...tenantScopeDrafts, [mode]: nextTenantIds });
			}
			return nextTenantIds;
		});
	};

	const removeTenantId = (id: string) => {
		setTenantIds((current) => {
			const nextTenantIds = current.filter((item) => item !== id);
			if (LIMITED_SCOPE_MODES.has(mode)) {
				saveDrafts({ ...tenantScopeDrafts, [mode]: nextTenantIds });
			}
			return nextTenantIds;
		});
	};

	const changeMode = (nextMode: ScopeMode) => {
		const nextDrafts = rememberCurrentMode(mode, tenantIds);
		setMode(nextMode);
		setTenantIds(LIMITED_SCOPE_MODES.has(nextMode) ? nextDrafts[nextMode as LimitedScopeMode] || [] : []);
	};

	const save = async () => {
		if (mode !== "all" && tenantIds.length === 0) {
			message.warning("请至少选择一个客户");
			return;
		}
		setSaving(true);
		try {
			await opsApi.saveTenantScope({ mode, tenantIds });
			message.success("数据可见范围已更新");
			onCancel();
			window.location.reload();
		} catch (error) {
			message.error(error instanceof Error ? error.message : "保存失败");
		} finally {
			setSaving(false);
		}
	};

	const limited = mode !== "all";
	const modeLabel = mode === "exclude" ? "不看" : "只看";
	const hintText = mode === "exclude" ? `不看 ${tenantIds.length} 个客户下的 【项目池列表】和 【工单列表】。` : `只看 ${tenantIds.length} 个客户下的【项目池列表】和 【工单列表】。`;

	return (
		<Modal title="数据可见范围" open={open} onCancel={onCancel} onOk={save} okText="保存" confirmLoading={saving} destroyOnHidden>
			<div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 4 }}>
				<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
					<Radio.Group
						value={mode}
						onChange={(event) => changeMode(event.target.value as ScopeMode)}
						style={{ display: "flex", flexWrap: "wrap", gap: 16 }}
					>
						<Radio value="all">全部客户</Radio>
						<Radio value="include">仅选中客户</Radio>
						<Radio value="exclude">排除选中客户</Radio>
					</Radio.Group>
				</div>
				<Select
					mode="multiple"
					showSearch
					disabled={!limited}
					loading={loading}
					placeholder={`搜索并添加${modeLabel}的客户`}
					value={[]}
					onChange={addTenantIds}
					optionFilterProp="label"
					options={(scope?.tenants || []).map((tenant) => ({ value: tenant.id, label: tenant.name, disabled: tenantIds.includes(String(tenant.id)) }))}
					style={{ width: "100%" }}
				/>
				{limited ? (
					<div style={{ display: "flex", flexWrap: "wrap", gap: 8, minHeight: 24 }}>
						{selectedTenants.length ? (
							selectedTenants.map((tenant) => (
								<Tag
									key={tenant.id}
									closable
									onClose={() => removeTenantId(tenant.id)}
									closeIcon={<span style={{ color: "#0f766e", fontWeight: 700 }}>×</span>}
									style={{ marginInlineEnd: 0, color: "#0f766e", background: "#ecfdf5", borderColor: "#99f6e4" }}>
									{tenant.name}
								</Tag>
							))
						) : (
							<Typography.Text type="secondary">暂未选择客户</Typography.Text>
						)}
					</div>
				) : null}
				{limited ? <Typography.Text style={{ color: "#dc2626", fontWeight: 700 }}>{hintText}</Typography.Text> : null}
      </div>
    </Modal>
  );
}
