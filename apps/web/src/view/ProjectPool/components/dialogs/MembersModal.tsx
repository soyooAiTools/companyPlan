import { Avatar, Empty, List, Modal, Space, Spin, Tag } from "antd";
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
    <Modal title={`协作成员 · ${project?.name ?? ""}`} open={open} onCancel={onCancel} footer={null} width={460}>
      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <Spin />
        </div>
      ) : members.length ? (
        <List
          dataSource={members}
          renderItem={(m) => (
            <List.Item>
              <List.Item.Meta
                avatar={
                  <Avatar src={m.avatar || undefined} style={{ background: "#e2e8f0", color: "#475569" }}>
                    {(m.name || "?").slice(0, 1)}
                  </Avatar>
                }
                title={
                  <Space size={6} wrap>
                    <span>{m.name || m.username || "-"}</span>
                    {m.tags.map((t) => (
                      <Tag key={t} color={t === "制片" ? "geekblue" : "default"} style={{ marginInlineEnd: 0 }}>
                        {t}
                      </Tag>
                    ))}
                  </Space>
                }
                description={m.wechatName ? <span style={{ color: "#94a3b8", fontSize: 12 }}>微信:{m.wechatName}</span> : null}
              />
            </List.Item>
          )}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无协作成员" />
      )}
    </Modal>
  );
}
