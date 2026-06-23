// 富文本内容展示:
//  - 纯文字 → 直接内联显示(textViewable=true 时再附一个「查看详情」眼睛图标,点开看完整内容)
//  - 含图片/视频等媒体 → 收成「查看」链接,点开弹框看(弹框内图片可点击放大)
// 需求说明、项目状态/阶段备注等富文本统一用它。
import { useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { Button, Image, Modal, Tooltip } from "antd";
import { PictureOutlined, EyeOutlined } from "@ant-design/icons";

// 是否含图片/视频等媒体
const hasMedia = (html: string): boolean => /<(img|video|audio|iframe|source)\b/i.test(html);

interface RichContentViewProps {
	html?: string | null;
	/** 含媒体时的链接文案 */
	linkText?: string;
	/** 弹框标题 */
	modalTitle?: string;
	/** 弹框宽度 */
	modalWidth?: number;
	/** 纯文字内联时的样式 */
	inlineStyle?: CSSProperties;
	/** 纯文字内联时的 className(优先用 Tailwind 工具类) */
	inlineClassName?: string;
	/** 纯文字时也提供「查看详情」眼睛图标(内容较长时有用) */
	textViewable?: boolean;
}

export default function RichContentView({ html, linkText = "查看(含图片/视频)", modalTitle = "详情", modalWidth = 640, inlineStyle, inlineClassName, textViewable }: RichContentViewProps) {
	const [open, setOpen] = useState(false);
	const [previewSrc, setPreviewSrc] = useState("");
	const [previewOpen, setPreviewOpen] = useState(false);
	if (!html) return null;

	const media = hasMedia(html);

	// 纯文字且不需要查看详情 → 直接内联
	if (!media && !textViewable) {
		return <div className={`ops-rich ${inlineClassName ?? ""}`} style={inlineStyle} dangerouslySetInnerHTML={{ __html: html }} />;
	}

	// 点击弹框正文里的图片 → 放大预览(antd Image 自带缩放/旋转/全屏)
	const onContentClick = (e: MouseEvent<HTMLDivElement>) => {
		const t = e.target as HTMLElement;
		if (t.tagName === "IMG") {
			const src = (t as HTMLImageElement).currentSrc || (t as HTMLImageElement).src;
			if (src) {
				setPreviewSrc(src);
				setPreviewOpen(true);
			}
		}
	};

	return (
		<>
			{media ? (
				// 含图片/视频 → 收成链接
				<Button type="link" size="small" icon={<PictureOutlined />} style={{ padding: 0, height: "auto" }} onClick={() => setOpen(true)}>
					{linkText}
				</Button>
			) : (
				// 纯文字 → 内联显示 + 查看详情眼睛
				<div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
					<div className={`ops-rich ${inlineClassName ?? ""}`} style={{ flex: 1, minWidth: 0, ...inlineStyle }} dangerouslySetInnerHTML={{ __html: html }} />
					<Tooltip title="查看详情">
						<Button type="text" size="small" icon={<EyeOutlined />} style={{ flexShrink: 0, color: "#0f766e" }} onClick={() => setOpen(true)} />
					</Tooltip>
				</div>
			)}
			<Modal title={modalTitle} open={open} onCancel={() => setOpen(false)} footer={null} width={modalWidth} styles={{ body: { maxHeight: "72vh", overflow: "auto" } }}>
				<style>{`.rcv-detail img { max-width: 100%; height: auto; border-radius: 6px; cursor: zoom-in; } .rcv-detail video { max-width: 100%; height: auto; border-radius: 6px; }`}</style>
				<div className="ops-rich rcv-detail" onClick={onContentClick} dangerouslySetInnerHTML={{ __html: html }} />
				{/* 受控图片预览:点正文图片放大 */}
				<Image style={{ display: "none" }} src={previewSrc} preview={{ visible: previewOpen, src: previewSrc, onVisibleChange: (v) => setPreviewOpen(v) }} />
			</Modal>
		</>
	);
}
