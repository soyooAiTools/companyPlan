// 建单说明的富文本编辑器(TipTap v3)。文字/格式/标题/列表/超链接/图片/视频/附件。
// 资源:工具栏插入 + 粘贴(截图)+ 拖拽 → 上传阿里云 OSS 后插入(图片=img,视频=video,其它=下载链接)。需先选项目。
// 受 antd Form 控制:接收 value(HTML)/ onChange。
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { App, Button, Input, Popover, Tooltip } from "antd";
import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  StrikethroughOutlined,
  UnorderedListOutlined,
  OrderedListOutlined,
  LinkOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  PaperClipOutlined,
  UndoOutlined,
  RedoOutlined,
} from "@ant-design/icons";
import { opsApi } from "../../api/modules/ops";
import "./RichText.css";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 图片 2MB
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 视频 / 压缩包等 10MB

// 内联视频节点(渲染 <video controls src>)
const Video = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { src: { default: null } };
  },
  parseHTML() {
    return [{ tag: "video" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["video", mergeAttributes(HTMLAttributes, { controls: "controls" })];
  },
});

// 仅有空标签且无媒体/链接 → 视为"无内容"
function isBlankHtml(html: string): boolean {
  if (!html) return true;
  if (/<(img|video|a)\b/i.test(html)) return false;
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export default function RichTextEditor({
  value,
  onChange,
  projectId,
  placeholder = "描述需求:可写文字、粘贴内容、加超链接、贴图片/视频/附件…",
}: {
  value?: string;
  onChange?: (html: string) => void;
  projectId?: string;
  placeholder?: string;
}) {
  const { message } = App.useApp();
  const [, setTick] = useState(0);
  const force = useCallback(() => setTick((t) => t + 1), []);
  const editorRef = useRef<Editor | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  // 上传任意文件到 OSS 并按类型插入:图片→img,视频→video,其它→下载链接
  const uploadAndInsert = useCallback(
    async (file: File) => {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      const max = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
      if (file.size > max) {
        message.warning(isImage ? "图片超过 2MB,请压缩后再传" : "文件超过 10MB");
        return;
      }
      if (!projectId) {
        message.warning("请先选择项目,再上传");
        return;
      }
      const hide = message.loading("上传中…", 0);
      try {
        const dataUrl = await fileToDataUrl(file);
        const { url } = await opsApi.uploadFile({ projectId, filename: file.name, mime: file.type, dataBase64: dataUrl });
        const chain = editorRef.current?.chain().focus();
        if (!chain) return;
        if (isImage) {
          chain.setImage({ src: url }).run();
        } else if (isVideo) {
          chain.insertContent({ type: "video", attrs: { src: url } }).run();
        } else {
          chain
            .insertContent([
              { type: "text", text: `📎 ${file.name}`, marks: [{ type: "link", attrs: { href: url } }] },
              { type: "text", text: " " },
            ])
            .run();
        }
      } catch (e) {
        message.error(e instanceof Error ? e.message : "上传失败");
      } finally {
        hide();
      }
    },
    [message, projectId],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      Image.configure({ inline: false, allowBase64: true }),
      Video,
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    editorProps: {
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (it.kind === "file") {
            const file = it.getAsFile();
            if (file) {
              void uploadAndInsert(file);
              return true;
            }
          }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        for (let i = 0; i < files.length; i++) void uploadAndInsert(files[i]);
        event.preventDefault();
        return true;
      },
    },
  });
  editorRef.current = editor;

  // 工具栏激活态随选区/输入刷新
  useEffect(() => {
    if (!editor) return;
    editor.on("transaction", force);
    editor.on("selectionUpdate", force);
    return () => {
      editor.off("transaction", force);
      editor.off("selectionUpdate", force);
    };
  }, [editor, force]);

  // 外部 value 变化(建单弹框重置)同步进编辑器;空内容互等,避免 '' 与 '<p></p>' 抖动
  useEffect(() => {
    if (!editor) return;
    const next = value || "";
    const current = editor.getHTML();
    if (next === current) return;
    if (isBlankHtml(next) && isBlankHtml(current)) return;
    editor.commands.setContent(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const href = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkOpen(false);
    setLinkUrl("");
  };

  const pickFile = (accept: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
  };

  const btn = (active: boolean, icon: ReactNode, title: string, onClick: () => void, disabled = false) => (
    <Tooltip title={title}>
      <Button size="small" type="text" disabled={disabled} icon={icon} onClick={onClick} style={active ? { background: "#e6f4f1", color: "#0f766e" } : undefined} />
    </Tooltip>
  );

  return (
    <div>
      <div style={{ color: "#cf1322", fontSize: 12, lineHeight: 1.5, marginBottom: 6 }}>
        图片 ≤ 2MB;视频 / 压缩包等文件 ≤ 10MB
      </div>
      <div className="ops-editor">
        <div className="ops-editor__toolbar" onMouseDown={(e) => e.preventDefault()}>
          {btn(editor.isActive("bold"), <BoldOutlined />, "加粗", () => editor.chain().focus().toggleBold().run())}
          {btn(editor.isActive("italic"), <ItalicOutlined />, "斜体", () => editor.chain().focus().toggleItalic().run())}
          {btn(editor.isActive("underline"), <UnderlineOutlined />, "下划线", () => editor.chain().focus().toggleUnderline().run())}
          {btn(editor.isActive("strike"), <StrikethroughOutlined />, "删除线", () => editor.chain().focus().toggleStrike().run())}
          <div className="ops-editor__sep" />
          {btn(editor.isActive("heading", { level: 2 }), <b>H2</b>, "标题", () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
          {btn(editor.isActive("heading", { level: 3 }), <b>H3</b>, "小标题", () => editor.chain().focus().toggleHeading({ level: 3 }).run())}
          {btn(editor.isActive("bulletList"), <UnorderedListOutlined />, "无序列表", () => editor.chain().focus().toggleBulletList().run())}
          {btn(editor.isActive("orderedList"), <OrderedListOutlined />, "有序列表", () => editor.chain().focus().toggleOrderedList().run())}
          <div className="ops-editor__sep" />
          <Popover
            open={linkOpen}
            onOpenChange={(o) => {
              setLinkOpen(o);
              if (o) setLinkUrl((editor.getAttributes("link").href as string) || "");
            }}
            trigger="click"
            content={
              <div style={{ display: "flex", gap: 6, width: 268 }}>
                <Input size="small" autoFocus placeholder="https://…(留空=移除链接)" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onPressEnter={applyLink} />
                <Button size="small" type="primary" onClick={applyLink}>
                  确定
                </Button>
              </div>
            }>
            <Tooltip title="超链接">
              <Button size="small" type="text" icon={<LinkOutlined />} style={editor.isActive("link") ? { background: "#e6f4f1", color: "#0f766e" } : undefined} />
            </Tooltip>
          </Popover>
          {btn(false, <PictureOutlined />, "插入图片(≤2MB)", () => pickFile("image/*"))}
          {btn(false, <VideoCameraOutlined />, "插入视频(≤10MB)", () => pickFile("video/*"))}
          {btn(false, <PaperClipOutlined />, "插入附件 / 压缩包(≤10MB)", () => pickFile("*/*"))}
          <div className="ops-editor__sep" />
          {btn(false, <UndoOutlined />, "撤销", () => editor.chain().focus().undo().run(), !editor.can().undo())}
          {btn(false, <RedoOutlined />, "重做", () => editor.chain().focus().redo().run(), !editor.can().redo())}
        </div>
        <EditorContent editor={editor} />
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadAndInsert(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
