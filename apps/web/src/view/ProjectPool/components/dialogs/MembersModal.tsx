import { Avatar, Empty, Modal, Space, Spin, Tag } from "antd";
import type { OpsProjectPoolMember, OpsProjectPoolRow } from "@/api/modules/ops";

type MembersModalProps = {
  open: boolean;
  project: OpsProjectPoolRow | null;
  members: OpsProjectPoolMember[];
  loading: boolean;
  onCancel: () => void;
};

export default function MembersModal({ open, project, members, loading, onCancel }: MembersModalProps) {
  return (
    <Modal title={`协作成员 · ${project?.name ?? ""}`} open={open} onCancel={onCancel} footer={null} width={920}>
      <style>{`
        .ops-project-members-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px 12px;
          max-height: min(68vh, 680px);
          overflow: auto;
          padding: 2px 4px 2px 0;
        }
        .ops-project-member-card {
          display: flex;
          align-items: flex-start;
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
        <div className="ops-project-members-grid">
          {members.map((m) => (
            <div key={m.id} className="ops-project-member-card">
              <Avatar src={m.avatar || undefined} style={{ background: "#e2e8f0", color: "#475569", flexShrink: 0 }}>
                {(m.name || "?").slice(0, 1)}
              </Avatar>
              <div style={{ minWidth: 0, flex: 1 }}>
                <Space size={6} wrap style={{ width: "100%", rowGap: 4 }}>
                  <span className="ops-project-member-name">{m.name || m.username || "-"}</span>
                  {m.status === "disabled" ? (
                    <Tag color="default" style={{ marginInlineEnd: 0 }}>
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
            </div>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无协作成员" />
      )}
    </Modal>
  );
}
