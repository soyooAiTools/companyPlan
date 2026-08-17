import { useEffect, useMemo, useState } from "react";
import { Modal, Radio, Select, Tag, Typography, message } from "antd";
import { opsApi, type OpsTenantScope } from "../../../api/modules/ops";

type ScopeMode = OpsTenantScope["mode"];

interface TenantScopeModalProps {
	open: boolean;
	onCancel: () => void;
}

export default function TenantScopeModal({ open, onCancel }: TenantScopeModalProps) {
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [scope, setScope] = useState<OpsTenantScope | null>(null);
	const [mode, setMode] = useState<ScopeMode>("all");
	const [tenantIds, setTenantIds] = useState<string[]>([]);
	const tenantNameById = useMemo(() => new Map((scope?.tenants || []).map((tenant) => [String(tenant.id), tenant.name])), [scope?.tenants]);
	const selectedTenants = useMemo(() => tenantIds.map((id) => ({ id, name: tenantNameById.get(id) || id })), [tenantIds, tenantNameById]);

	useEffect(() => {
		if (!open) return;
		let disposed = false;
		setLoading(true);
		opsApi
			.tenantScope()
			.then((result) => {
				if (disposed) return;
				const nextScope = result.scope;
				setScope(nextScope);
				setMode(nextScope.mode || "all");
				setTenantIds(nextScope.tenantIds || []);
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
		setTenantIds((current) => [...new Set([...current, ...ids.map(String)])]);
	};

	const removeTenantId = (id: string) => {
		setTenantIds((current) => current.filter((item) => item !== id));
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
						onChange={(event) => setMode(event.target.value as ScopeMode)}
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
