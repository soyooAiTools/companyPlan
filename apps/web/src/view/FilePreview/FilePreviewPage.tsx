import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Alert, Button, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { DownloadOutlined } from "@ant-design/icons";
import type { FileType } from "jit-viewer";
import { previewTypeOf } from "@/utils/filePreview";
import "./FilePreviewPage.css";

const MAX_INLINE_PREVIEW_BYTES = 20 * 1024 * 1024;
const JitFileViewer = lazy(() => import("./JitFileViewer"));

function safeUrl(value: string | null) {
	const url = String(value || "").trim();
	if (!/^https?:\/\//i.test(url)) return "";
	return url;
}

function sdkFileTypeOf(filename: string, hint?: string | null): FileType | undefined {
	const ext = filename.toLowerCase().match(/\.([a-z0-9]{1,10})$/)?.[1];
	if (ext === "pdf") return "pdf";
	if (ext === "doc" || ext === "docx") return "docx";
	if (ext === "xls" || ext === "xlsx") return ext;
	if (ext === "csv") return "csv";
	if (ext === "ppt" || ext === "pptx") return ext;
	if (hint === "pdf") return "pdf";
	if (hint === "word") return "docx";
	if (hint === "excel") return "xlsx";
	if (hint === "ppt") return "pptx";
	return undefined;
}

export default function FilePreviewPage() {
	const [error, setError] = useState("");
	const params = useMemo(() => new URLSearchParams(window.location.search), []);
	const fileUrl = safeUrl(params.get("url"));
	const filename = params.get("filename") || "附件";
	const size = Number(params.get("size") || 0);
	const type = sdkFileTypeOf(filename, params.get("type") || previewTypeOf(filename, undefined, fileUrl));
	const tooLargeForPreview = size > MAX_INLINE_PREVIEW_BYTES;
	const onViewerError = useCallback((message: string) => setError(message), []);

	return (
		<ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#0f766e" } }}>
			<div className="file-preview-page">
				<main className="file-preview-page__body">
					{error ? (
						<div className="file-preview-page__error">
							<Alert type="warning" showIcon message={error} description="当前文件暂时无法在线预览，可以点击右上角下载原文件查看。" />
						</div>
					) : null}
					{tooLargeForPreview ? (
						<div className="file-preview-page__large">
							<Alert
								type="info"
								showIcon
								message="文件较大，建议下载查看"
								description="超过 20MB 的 Word / Excel / PDF 文件在线预览会比较慢，已为你保留原文件下载入口。"
							/>
							{fileUrl ? (
								<Button type="primary" size="large" icon={<DownloadOutlined />} href={fileUrl} target="_blank" rel="noreferrer">
									下载原文件
								</Button>
							) : null}
						</div>
					) : !fileUrl ? (
						<div className="file-preview-page__error">
							<Alert type="warning" showIcon message="文件地址不合法" description="当前文件暂时无法在线预览。" />
						</div>
					) : (
						<Suspense fallback={<div className="file-preview-page__sdk-loading">预览器加载中...</div>}>
							<JitFileViewer fileUrl={fileUrl} filename={filename} type={type} onError={onViewerError} />
						</Suspense>
					)}
				</main>
			</div>
		</ConfigProvider>
	);
}
