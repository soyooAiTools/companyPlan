// 站内消息铃铛:图标 + 未读红点 → 点开**居中大 Modal**;两个 tab(未读/全部,默认未读)+ 分页;点条目标已读并跳深链。
import { useEffect, useState } from "react";
import { BellOutlined } from "@ant-design/icons";
import { App, Badge, Button, List, Modal, Pagination, Segmented, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { opsApi, type OpsNotification } from "../../../api/modules/ops";

const PAGE_SIZE = 8;

export default function NotificationBell({
  unread,
  bump,
  onRead,
  onReadAll,
}: {
  unread: number;
  bump: number; // 来新通知的信号:Modal 开着时据此重拉当前页
  onRead: (id: string) => void;
  onReadAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const [page, setPage] = useState(1);
  const [reloadSeq, setReloadSeq] = useState(0); // 全部已读后手动触发重拉
  const [items, setItems] = useState<OpsNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const { message } = App.useApp();
  const navigate = useNavigate();

  // Modal 开着时:tab / 页码 / 新通知 / 全部已读 任一变化都重拉当前页
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    opsApi
      .notifications(tab, page, PAGE_SIZE)
      .then((r) => {
        if (active) {
          setItems(r.items);
          setTotal(r.total);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, tab, page, bump, reloadSeq]);

  const openModal = () => {
    setTab("unread"); // 默认未读
    setPage(1);
    setOpen(true);
  };

  const onClickItem = (n: OpsNotification) => {
    if (!n.readAt) onRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const readAll = async () => {
    await onReadAll();
    setReloadSeq((s) => s + 1);
  };

  // 发测试通知给自己:没授权先申请权限,再发一条,验证桌面通知 + 铃铛是否正常
  const sendTest = async () => {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    setTesting(true);
    try {
      await opsApi.notifTest();
      if ("Notification" in window && Notification.permission === "granted") {
        message.success("已发送 → 桌面右上角应弹出,铃铛也会 +1");
      } else {
        message.warning("已发送,铃铛能收到;但桌面通知未授权,需在浏览器/系统设置里允许通知");
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : "发送失败");
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <Badge count={unread} size="small">
        <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} aria-label="通知" onClick={openModal} />
      </Badge>
      <Modal open={open} onCancel={() => setOpen(false)} footer={null} centered title="通知" width={680} styles={{ body: { minHeight: 480, display: "flex", flexDirection: "column" } }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Segmented
            value={tab}
            onChange={(v) => {
              setTab(v as "unread" | "all");
              setPage(1);
            }}
            options={[
              { label: unread ? `未读 (${unread})` : "未读", value: "unread" },
              { label: "全部", value: "all" },
            ]}
          />
          <Button type="link" size="small" onClick={readAll} disabled={!unread}>
            全部已读
          </Button>
        </div>
        <List
          loading={loading}
          dataSource={items}
          locale={{ emptyText: tab === "unread" ? "没有未读通知" : "暂无通知" }}
          style={{ flex: 1, minHeight: 360 }}
          renderItem={(n) => (
            <List.Item style={{ cursor: "pointer", padding: "12px 8px", background: n.readAt ? undefined : "#f6ffed" }} onClick={() => onClickItem(n)}>
              <div style={{ width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: n.readAt ? 400 : 600 }}>{n.title}</span>
                  {!n.readAt && <Badge color="#52c41a" />}
                </div>
                <Typography.Paragraph type="secondary" style={{ margin: "2px 0 0", fontSize: 12 }} ellipsis={{ rows: 2 }}>
                  {n.body}
                </Typography.Paragraph>
              </div>
            </List.Item>
          )}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button size="small" loading={testing} onClick={sendTest}>
              发送测试通知
            </Button>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              收不到?点这个给自己发一条测试(没授权会先弹窗申请)
            </Typography.Text>
          </div>
          <Pagination current={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} size="small" showSizeChanger={false} hideOnSinglePage />
        </div>
      </Modal>
    </>
  );
}
