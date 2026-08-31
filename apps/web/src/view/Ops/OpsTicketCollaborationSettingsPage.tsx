import { useEffect, useMemo, useState } from "react";
import { App, Avatar, Button, Empty, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from "antd";
import { EditOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { opsApi } from "../../api/modules/ops";
import type { OpsCollaborationPermission, OpsCollaborationUser } from "../../api/modules/ops";

type ConfigMode = "leader" | "mutual";

interface GroupRow {
	viewerUserId: string;
	viewerName: string;
	viewerWechatName?: string;
	viewerUsername: string;
	viewerAvatar?: string;
	targets: OpsCollaborationPermission[];
}

interface MutualGroupRow {
	id: string;
	memberIds: string[];
	permissions: OpsCollaborationPermission[];
}

function displayName(user?: Pick<OpsCollaborationUser, "name" | "username" | "wechatName"> | null) {
	if (!user) return "-";
	return user.name || user.wechatName || user.username || "-";
}

function permissionUserName(id: string, userById: Map<string, OpsCollaborationUser>, fallbackName?: string, fallbackUsername?: string) {
	const user = userById.get(id);
	return displayName(user) !== "-" ? displayName(user) : fallbackName || fallbackUsername || id;
}

function permissionUsername(id: string, userById: Map<string, OpsCollaborationUser>, fallbackUsername?: string) {
	return userById.get(id)?.username || fallbackUsername || "";
}

function permissionAvatar(id: string, userById: Map<string, OpsCollaborationUser>, fallbackAvatar?: string) {
	return userById.get(id)?.avatar || fallbackAvatar || "";
}

function permissionWechatName(id: string, userById: Map<string, OpsCollaborationUser>, fallbackWechatName = "", fallbackName = "") {
	const user = userById.get(id);
	const name = displayName(user) !== "-" ? displayName(user) : fallbackName;
	const wechatName = user?.wechatName || fallbackWechatName || "";
	return wechatName && wechatName !== name ? wechatName : "";
}

function normalizeSearchValue(value: string) {
	return value.trim().toLowerCase();
}

function userNameSearchText(user: OpsCollaborationUser) {
	return [user.name, user.wechatName, user.username].filter(Boolean).join(" ").toLowerCase();
}

function userTagSearchTexts(user: OpsCollaborationUser) {
	return (user.tags || [])
		.map((tag) => (typeof tag === "string" ? tag : tag.name))
		.map(normalizeSearchValue)
		.filter(Boolean);
}

function tagName(tag: NonNullable<OpsCollaborationUser["tags"]>[number]) {
	return typeof tag === "string" ? tag : tag.name;
}

function tagColor(tag: NonNullable<OpsCollaborationUser["tags"]>[number]) {
	return typeof tag === "string" ? "" : tag.color || "";
}

function UserTagBadge({ tag }: { tag: NonNullable<OpsCollaborationUser["tags"]>[number] }) {
	const color = tagColor(tag) || "#1677ff";
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				height: 20,
				padding: "0 7px",
				borderRadius: 999,
				background: color,
				color: "#fff",
				fontSize: 12,
				fontWeight: 600,
				lineHeight: "20px",
				whiteSpace: "nowrap",
			}}
		>
			{tagName(tag)}
		</span>
	);
}

function renderUserOption(user?: OpsCollaborationUser) {
	if (!user) return null;
	return (
		<Space size={6} wrap style={{ minHeight: 28 }}>
			{(user.tags || []).slice(0, 2).map((tag) => (
				<UserTagBadge key={tagName(tag)} tag={tag} />
			))}
			<span>{displayName(user)}</span>
			{user.username ? <Typography.Text type="secondary">（{user.username}）</Typography.Text> : null}
		</Space>
	);
}

function UserInfoTag({
	id,
	userById,
	color = "blue",
	fallbackName,
	fallbackWechatName,
	fallbackUsername,
	fallbackAvatar,
}: {
	id: string;
	userById: Map<string, OpsCollaborationUser>;
	color?: "blue" | "green";
	fallbackName?: string;
	fallbackWechatName?: string;
	fallbackUsername?: string;
	fallbackAvatar?: string;
}) {
	const palette =
		color === "green"
			? { background: "#f0fdfa", borderColor: "#99f6e4", text: "#0f766e" }
			: { background: "#f8fafc", borderColor: "#dbeafe", text: "#1e40af" };
	const wechatName = permissionWechatName(id, userById, fallbackWechatName, fallbackName);
	return (
		<Tag key={id} style={{ borderRadius: 4, background: palette.background, borderColor: palette.borderColor, color: palette.text, padding: "3px 8px" }}>
			<Space size={4}>
				<Avatar size={18} src={permissionAvatar(id, userById, fallbackAvatar)}>
					{permissionUserName(id, userById, fallbackName, fallbackUsername).slice(0, 1)}
				</Avatar>
				<span>{permissionUserName(id, userById, fallbackName, fallbackUsername)}</span>
				{wechatName ? <Typography.Text style={{ color: palette.text, fontSize: 12 }}>({wechatName})</Typography.Text> : null}
			</Space>
		</Tag>
	);
}

function SelectedUserChips({
	title,
	ids,
	userById,
	onRemove,
}: {
	title: string;
	ids: string[];
	userById: Map<string, OpsCollaborationUser>;
	onRemove: (id: string) => void;
}) {
	if (ids.length === 0) return null;
	return (
		<div
			style={{
				gridColumn: "1 / -1",
				padding: "10px 12px",
				border: "1px solid #e2e8f0",
				borderRadius: 8,
				background: "#f8fafc",
			}}
		>
			<Space size={[8, 8]} wrap>
				<Typography.Text type="secondary" style={{ fontSize: 12 }}>
					{title} {ids.length} 人
				</Typography.Text>
				{ids.map((id) => {
					const user = userById.get(id);
					return (
						<Tag key={id} closable onClose={() => onRemove(id)} style={{ marginInlineEnd: 0, borderRadius: 4, color: "#111827" }}>
							{displayName(user)}
							{user?.username ? `：${user.username}` : ""}
						</Tag>
					);
				})}
			</Space>
		</div>
	);
}

export default function OpsTicketCollaborationSettingsPage() {
	const { message } = App.useApp();
	const [users, setUsers] = useState<OpsCollaborationUser[]>([]);
	const [permissions, setPermissions] = useState<OpsCollaborationPermission[]>([]);
	const [configMode, setConfigMode] = useState<ConfigMode>("leader");
	const [editorOpen, setEditorOpen] = useState(false);
	const [viewerUserId, setViewerUserId] = useState("");
	const [targetUserIds, setTargetUserIds] = useState<string[]>([]);
	const [mutualUserIds, setMutualUserIds] = useState<string[]>([]);
	const [targetSearch, setTargetSearch] = useState("");
	const [targetOpen, setTargetOpen] = useState(false);
	const [mutualSearch, setMutualSearch] = useState("");
	const [mutualOpen, setMutualOpen] = useState(false);
	const [editingMutualPermissionIds, setEditingMutualPermissionIds] = useState<number[]>([]);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);

	const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
	const exactTagSet = useMemo(() => new Set(users.flatMap((user) => userTagSearchTexts(user))), [users]);
	const userOptions = useMemo(
		() =>
			users.map((user) => ({
				value: user.id,
				label: `${displayName(user)}${user.username ? `（${user.username}）` : ""}`,
				nameSearchText: userNameSearchText(user),
				tagSearchTexts: userTagSearchTexts(user),
			})),
		[users],
	);
	const targetOptions = useMemo(() => userOptions.filter((item) => item.value !== viewerUserId), [userOptions, viewerUserId]);
	const selectedUserPlaceholder = (count: number) => (count > 0 ? `已选 ${count} 人，可继续搜索添加` : undefined);
	const filterUserOption = (input: string, option?: { nameSearchText?: string; tagSearchTexts?: string[] }) => {
		const keyword = normalizeSearchValue(input);
		if (!keyword) return true;
		const tagTexts = option?.tagSearchTexts || [];
		if (exactTagSet.has(keyword)) return tagTexts.includes(keyword);
		return String(option?.nameSearchText || "").includes(keyword) || tagTexts.some((tag) => tag.includes(keyword));
	};

	const mutualGroupRows = useMemo<MutualGroupRow[]>(() => {
		const permissionByPair = new Map<string, OpsCollaborationPermission>();
		for (const item of permissions) {
			permissionByPair.set(`${item.viewerUserId}->${item.targetUserId}`, item);
		}

		const graph = new Map<string, Set<string>>();
		for (const item of permissions) {
			if (!permissionByPair.has(`${item.targetUserId}->${item.viewerUserId}`)) continue;
			if (!graph.has(item.viewerUserId)) graph.set(item.viewerUserId, new Set());
			if (!graph.has(item.targetUserId)) graph.set(item.targetUserId, new Set());
			graph.get(item.viewerUserId)!.add(item.targetUserId);
			graph.get(item.targetUserId)!.add(item.viewerUserId);
		}

		const visited = new Set<string>();
		const groups: MutualGroupRow[] = [];
		for (const userId of graph.keys()) {
			if (visited.has(userId)) continue;
			const memberIds: string[] = [];
			const stack = [userId];
			visited.add(userId);
			while (stack.length) {
				const current = stack.pop()!;
				memberIds.push(current);
				for (const next of graph.get(current) || []) {
					if (visited.has(next)) continue;
					visited.add(next);
					stack.push(next);
				}
			}
			if (memberIds.length < 2) continue;
			memberIds.sort((a, b) => permissionUserName(a, userById).localeCompare(permissionUserName(b, userById), "zh-Hans-CN"));
			const memberSet = new Set(memberIds);
			const groupPermissions = permissions.filter((item) => memberSet.has(item.viewerUserId) && memberSet.has(item.targetUserId));
			groups.push({ id: memberIds.join("-"), memberIds, permissions: groupPermissions });
		}
		return groups;
	}, [permissions, userById]);

	const groupedRows = useMemo<GroupRow[]>(() => {
		const mutualPermissionIds = new Set(mutualGroupRows.flatMap((row) => row.permissions.map((item) => item.id)));
		const map = new Map<string, GroupRow>();
		for (const item of permissions) {
			if (mutualPermissionIds.has(item.id)) continue;
			if (!map.has(item.viewerUserId)) {
				map.set(item.viewerUserId, {
					viewerUserId: item.viewerUserId,
					viewerName: item.viewerName,
					viewerWechatName: item.viewerWechatName,
					viewerUsername: item.viewerUsername,
					viewerAvatar: item.viewerAvatar,
					targets: [],
				});
			}
			const row = map.get(item.viewerUserId)!;
			row.targets.push(item);
		}
		return [...map.values()];
	}, [mutualGroupRows, permissions]);

	const load = async () => {
		setLoading(true);
		try {
			const [userResp, permissionResp] = await Promise.all([opsApi.collaborationUsers(), opsApi.ticketCollaborationPermissions()]);
			setUsers(userResp.users);
			setPermissions(permissionResp.permissions);
		} catch (e) {
			message.error(e instanceof Error ? e.message : "加载协作权限失败");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void load();
	}, []);

	const editGroup = (row: GroupRow) => {
		setConfigMode("leader");
		setEditorOpen(true);
		setViewerUserId(row.viewerUserId);
		setTargetUserIds(row.targets.map((item) => item.targetUserId));
		setMutualUserIds([]);
		setEditingMutualPermissionIds([]);
		setTargetSearch("");
		setTargetOpen(false);
	};

	const editMutualGroup = (row: MutualGroupRow) => {
		setConfigMode("mutual");
		setEditorOpen(true);
		setViewerUserId("");
		setTargetUserIds([]);
		setMutualUserIds(row.memberIds);
		setEditingMutualPermissionIds(row.permissions.map((item) => item.id));
		setMutualSearch("");
		setMutualOpen(false);
	};

	const resetForm = () => {
		setConfigMode("leader");
		setEditorOpen(false);
		setViewerUserId("");
		setTargetUserIds([]);
		setMutualUserIds([]);
		setEditingMutualPermissionIds([]);
		setTargetSearch("");
		setMutualSearch("");
		setTargetOpen(false);
		setMutualOpen(false);
	};

	const save = async () => {
		if (configMode === "mutual") {
			if (mutualUserIds.length < 2) {
				message.warning("工单互通至少需要选择 2 个人");
				return;
			}
			setSaving(true);
			try {
				if (editingMutualPermissionIds.length) {
					await Promise.all(editingMutualPermissionIds.map((id) => opsApi.deleteCollaborationPermission(id)));
				}
				const resp = await opsApi.saveMutualTicketCollaborationPermissions(mutualUserIds);
				setPermissions(resp.permissions);
				message.success("已保存工单互通关系");
				resetForm();
			} catch (e) {
				message.error(e instanceof Error ? e.message : "保存失败");
			} finally {
				setSaving(false);
			}
			return;
		}
		if (!viewerUserId) {
			message.warning("请选择协作人");
			return;
		}
		setSaving(true);
		try {
			const resp = await opsApi.saveTicketCollaborationPermissions({ viewerUserId, targetUserIds });
			setPermissions(resp.permissions);
			message.success("已保存组长协作关系");
			resetForm();
		} catch (e) {
			message.error(e instanceof Error ? e.message : "保存失败");
		} finally {
			setSaving(false);
		}
	};

	const clearMutualGroup = async (row: MutualGroupRow) => {
		setSaving(true);
		try {
			await Promise.all(row.permissions.map((item) => opsApi.deleteCollaborationPermission(item.id)));
			message.success("已清空互通组");
			if (editingMutualPermissionIds.some((id) => row.permissions.some((item) => item.id === id))) resetForm();
			await load();
		} catch (e) {
			message.error(e instanceof Error ? e.message : "清空失败");
		} finally {
			setSaving(false);
		}
	};

	const clearGroup = async (row: GroupRow) => {
		setSaving(true);
		try {
			const resp = await opsApi.saveTicketCollaborationPermissions({ viewerUserId: row.viewerUserId, targetUserIds: [] });
			setPermissions(resp.permissions);
			message.success("已清空");
			if (viewerUserId === row.viewerUserId) resetForm();
		} catch (e) {
			message.error(e instanceof Error ? e.message : "清空失败");
		} finally {
			setSaving(false);
		}
	};

	const openCreateEditor = (mode: ConfigMode) => {
		resetForm();
		setConfigMode(mode);
		setEditorOpen(true);
	};

	const columns = [
		{
			title: "协作人",
			key: "viewer",
			width: 220,
			render: (_: unknown, row: GroupRow) => (
				<Space>
					<Avatar src={permissionAvatar(row.viewerUserId, userById, row.viewerAvatar)}>{permissionUserName(row.viewerUserId, userById, row.viewerName, row.viewerUsername).slice(0, 1)}</Avatar>
					<span style={{ fontWeight: 600 }}>
						{permissionUserName(row.viewerUserId, userById, row.viewerName, row.viewerUsername)}
						{permissionWechatName(row.viewerUserId, userById, row.viewerWechatName, row.viewerName) ? `（${permissionWechatName(row.viewerUserId, userById, row.viewerWechatName, row.viewerName)}）` : ""}
					</span>
				</Space>
			),
		},
		{
			title: "可处理成员",
			key: "targets",
			render: (_: unknown, row: GroupRow) => (
				<Space size={[8, 8]} wrap>
					{row.targets.map((target) => (
						<UserInfoTag key={target.id} id={target.targetUserId} userById={userById} fallbackName={target.targetName} fallbackWechatName={target.targetWechatName} fallbackUsername={target.targetUsername} fallbackAvatar={target.targetAvatar} />
					))}
				</Space>
			),
		},
		{
			title: "操作",
			key: "action",
			width: 150,
			render: (_: unknown, row: GroupRow) => (
				<Space>
					<Button size="small" icon={<EditOutlined />} onClick={() => editGroup(row)}>
						编辑
					</Button>
					<Popconfirm title="清空该授权人的协作成员？" okText="清空" cancelText="取消" onConfirm={() => clearGroup(row)}>
						<Button size="small" danger>
							清空
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	const mutualColumns = [
		{
			title: "互通成员",
			key: "members",
			render: (_: unknown, row: MutualGroupRow) => (
				<Space size={[8, 8]} wrap>
					{row.memberIds.map((id) => (
						<UserInfoTag key={id} id={id} userById={userById} color="green" />
					))}
				</Space>
			),
		},
		{
			title: "操作",
			key: "action",
			width: 150,
			render: (_: unknown, row: MutualGroupRow) => (
				<Space>
					<Button size="small" icon={<EditOutlined />} onClick={() => editMutualGroup(row)}>
						编辑
					</Button>
					<Popconfirm title="清空该互通组？" okText="清空" cancelText="取消" onConfirm={() => clearMutualGroup(row)}>
						<Button size="small" danger>
							清空
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div style={{ maxWidth: 1080 }}>
			<Space direction="vertical" size={12} style={{ width: "100%" }}>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
					<div>
						<Typography.Title level={5} style={{ margin: 0 }}>
							工单协作权限
						</Typography.Title>
					</div>
					<Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
						刷新
					</Button>
				</div>

				<Space direction="vertical" size={8} style={{ width: "100%" }}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
						<div>
							<Typography.Text strong>工单互通组</Typography.Text>
							<Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
								组内成员互相查看并处理彼此负责的工单
							</Typography.Text>
						</div>
						<Button type="primary" icon={<PlusOutlined />} onClick={() => openCreateEditor("mutual")}>
							新增互通组
						</Button>
					</div>
					<Table
						rowKey="id"
						size="middle"
						loading={loading}
						dataSource={mutualGroupRows}
						columns={mutualColumns}
						pagination={false}
						locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无工单互通组" /> }}
					/>
				</Space>
				<Space direction="vertical" size={8} style={{ width: "100%" }}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
						<div>
							<Typography.Text strong>组长协作</Typography.Text>
							<Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
								一个协作人处理多个成员的工单
							</Typography.Text>
						</div>
						<Button icon={<PlusOutlined />} onClick={() => openCreateEditor("leader")}>
							新增组长协作
						</Button>
					</div>
					<Table
						rowKey="viewerUserId"
						size="middle"
						loading={loading}
						dataSource={groupedRows}
						columns={columns}
						pagination={false}
						locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无组长协作权限" /> }}
					/>
				</Space>
				<Modal
					open={editorOpen}
					title={
						configMode === "mutual"
							? editingMutualPermissionIds.length
								? "编辑工单互通组"
								: "新增工单互通组"
							: viewerUserId
								? "编辑组长协作"
								: "新增组长协作"
					}
					width={760}
					okText="保存"
					cancelText="取消"
					confirmLoading={saving}
					onOk={save}
					onCancel={resetForm}
					destroyOnHidden
				>
					<Space direction="vertical" size={14} style={{ width: "100%", paddingTop: 4 }}>
						{configMode === "leader" ? (
							<>
								<div>
									<Typography.Text strong>协作人</Typography.Text>
									<Select
										showSearch
										allowClear
										placeholder="选择组长/协作人"
										options={userOptions}
										value={viewerUserId || undefined}
										filterOption={filterUserOption}
										optionRender={(option) => renderUserOption(userById.get(String(option.value)))}
										onChange={(value) => {
											setViewerUserId(value || "");
											setTargetUserIds((prev) => prev.filter((id) => id !== value));
										}}
										style={{ width: "100%", marginTop: 8 }}
									/>
								</div>
								<div>
									<Typography.Text strong>可处理成员</Typography.Text>
									<Select
										mode="multiple"
										showSearch
										allowClear
										autoClearSearchValue={false}
										open={targetOpen}
										searchValue={targetSearch}
										maxTagCount={0}
										maxTagPlaceholder={() => null}
										placeholder={selectedUserPlaceholder(targetUserIds.length) || "选择组员/可协作成员"}
										options={targetOptions}
										value={targetUserIds}
										filterOption={filterUserOption}
										optionRender={(option) => renderUserOption(userById.get(String(option.value)))}
										onDropdownVisibleChange={setTargetOpen}
										onSearch={setTargetSearch}
										onChange={(ids) => {
											setTargetUserIds(ids);
											setTargetOpen(true);
										}}
										style={{ width: "100%", marginTop: 8 }}
									/>
								</div>
								<SelectedUserChips title="已选可协作成员" ids={targetUserIds} userById={userById} onRemove={(id) => setTargetUserIds((prev) => prev.filter((item) => item !== id))} />
							</>
						) : (
							<>
								<div>
									<Typography.Text strong>互通成员</Typography.Text>
									<Select
										mode="multiple"
										showSearch
										allowClear
										autoClearSearchValue={false}
										open={mutualOpen}
										searchValue={mutualSearch}
										maxTagCount={0}
										maxTagPlaceholder={() => null}
										placeholder={selectedUserPlaceholder(mutualUserIds.length) || "选择需要工单互通的成员"}
										options={userOptions}
										value={mutualUserIds}
										filterOption={filterUserOption}
										optionRender={(option) => renderUserOption(userById.get(String(option.value)))}
										onDropdownVisibleChange={setMutualOpen}
										onSearch={setMutualSearch}
										onChange={(ids) => {
											setMutualUserIds(ids);
											setMutualOpen(true);
										}}
										style={{ width: "100%", marginTop: 8 }}
									/>
								</div>
								<SelectedUserChips title="已选互通成员" ids={mutualUserIds} userById={userById} onRemove={(id) => setMutualUserIds((prev) => prev.filter((item) => item !== id))} />
							</>
						)}
					</Space>
				</Modal>
			</Space>
		</div>
	);
}
