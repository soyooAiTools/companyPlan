import { useEffect, useState } from "react";
import { Avatar, Button, Empty, Modal, Space, Spin, Tag } from "antd";
import type { OpsProjectPoolMember, OpsProjectPoolRow } from "@/api/modules/ops";

type MembersModalProps = {
  open: boolean;
  project: OpsProjectPoolRow | null;
  members: OpsProjectPoolMember[];
  loading: boolean;
  onCreateTicket?: (member: OpsProjectPoolMember) => void;
  onCancel: () => void;
};

const groupMembers = (members: OpsProjectPoolMember[]) => {
  const groups = new Map<string, OpsProjectPoolMember[]>();
  if (members.length) groups.set("所有", members);
  for (const member of members) {
    const tags = member.tags?.length ? member.tags : ["未分组"];
    for (const tag of tags) {
      const groupTag = tag === "unity开发" || tag === "cocos开发" ? "开发" : tag;
      if (!groups.has(groupTag)) groups.set(groupTag, []);
      groups.get(groupTag)?.push(member);
    }
  }
  return [...groups.entries()].map(([tag, rows]) => ({ tag, rows }));
};

export default function MembersModal({ open, project, members, loading, onCreateTicket, onCancel }: MembersModalProps) {
  const groups = groupMembers(members);
  const [activeTag, setActiveTag] = useState("所有");
  useEffect(() => {
    if (!open) return;
    setActiveTag("所有");
  }, [open, project?.id]);
  const activeGroup = groups.find((group) => group.tag === activeTag) || groups[0];
  return (
    <Modal title={`协作成员 · ${project?.name ?? ""}`} open={open} onCancel={onCancel} footer={null} width={920}>
      <style>{`
        .ops-project-members-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px 12px;
        }
        .ops-project-members-tabs {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 0 10px;
          border-bottom: 1px solid #eef2f7;
          margin-bottom: 12px;
          overflow-x: auto;
        }
        .ops-project-members-tab {
          border: 0;
          background: transparent;
          padding: 5px 4px;
          color: #475569;
          font-size: 13px;
          line-height: 20px;
          white-space: nowrap;
          cursor: pointer;
          border-bottom: 2px solid transparent;
        }
        .ops-project-members-tab:hover {
          color: #0f766e;
        }
        .ops-project-members-tab.is-active {
          color: #0f766e;
          font-weight: 700;
          border-bottom-color: #0f766e;
        }
        .ops-project-members-tab-panel {
          max-height: min(62vh, 620px);
          overflow: auto;
          padding: 2px 4px 2px 0;
        }
        .ops-project-member-card {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          padding: 10px;
          border: 1px solid #eef2f7;
          border-radius: 8px;
          background: #fff;
        }
        .ops-project-member-name {
          color: #0f172a;
          font-weight: 700;
          line-height: 20px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ops-project-member-wechat {
          color: #94a3b8;
          font-size: 12px;
          line-height: 18px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <Spin />
        </div>
      ) : members.length ? (
        <>
          <div className="ops-project-members-tabs">
            {groups.map((group) => (
              <button key={group.tag} type="button" className={`ops-project-members-tab${activeGroup?.tag === group.tag ? " is-active" : ""}`} onClick={() => setActiveTag(group.tag)}>
                {group.tag}
                <span style={{ color: activeGroup?.tag === group.tag ? "#0f766e" : "#64748b", marginLeft: 2 }}>({group.rows.length})</span>
              </button>
            ))}
          </div>
          <div className="ops-project-members-tab-panel">
            <div className="ops-project-members-grid">
              {(activeGroup?.rows || []).map((m) => (
                <div key={`${activeGroup?.tag}-${m.id}`} className="ops-project-member-card">
                  <Avatar src={m.avatar || undefined} style={{ background: "#e2e8f0", color: "#475569", flexShrink: 0 }}>
                    {(m.name || "?").slice(0, 1)}
                  </Avatar>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Space size={6} wrap style={{ width: "100%", rowGap: 4 }}>
                      <span className="ops-project-member-name">{m.name || m.username || "-"}</span>
                      {m.status === "disabled" ? (
                        <Tag color="red" style={{ marginInlineEnd: 0 }}>
                          已禁用
                        </Tag>
                      ) : null}
                      {m.tags.map((t) => (
                        <Tag key={t} color={t === "制片" ? "geekblue" : "default"} style={{ marginInlineEnd: 0 }}>
                          {t}
                        </Tag>
                      ))}
                    </Space>
                    {m.wechatName ? <div className="ops-project-member-wechat">微信:{m.wechatName}</div> : null}
                  </div>
                  {onCreateTicket && m.status !== "disabled" ? (
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: "0 2px", height: 22, color: "#0f766e", fontSize: 12, fontWeight: 500, flexShrink: 0 }}
                      onClick={() => onCreateTicket(m)}>
                      提单
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无协作成员" />
      )}
    </Modal>
  );
}
