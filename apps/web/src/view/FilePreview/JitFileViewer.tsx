import { useEffect, useRef, useState } from "react";
import { createViewer, type FileType, type ViewerInstance } from "jit-viewer";
import "jit-viewer/style.css";

type JitFileViewerProps = {
	fileUrl: string;
	filename: string;
	type?: FileType;
	onError: (message: string) => void;
};

function downloadFileWithProgress(url: string, onProgress: (percent: number) => void): { promise: Promise<Blob>; abort: () => void } {
	const xhr = new XMLHttpRequest();
	const promise = new Promise<Blob>((resolve, reject) => {
		xhr.open("GET", url);
		xhr.responseType = "blob";
		xhr.onprogress = (event) => {
			if (!event.lengthComputable || event.total <= 0) return;
			onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
		};
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				onProgress(100);
				resolve(xhr.response as Blob);
				return;
			}
			reject(new Error(`文件下载失败(${xhr.status})`));
		};
		xhr.onerror = () => reject(new Error("文件下载失败"));
		xhr.onabort = () => reject(new Error("文件下载已取消"));
		xhr.send();
	});
	return { promise, abort: () => xhr.abort() };
}

export default function JitFileViewer({ fileUrl, filename, type, onError }: JitFileViewerProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const viewerRef = useRef<ViewerInstance | null>(null);
	const [progress, setProgress] = useState(0);
	const [phase, setPhase] = useState<"downloading" | "rendering" | "ready">("downloading");

	useEffect(() => {
		if (!containerRef.current) return;
		let disposed = false;
		let abortDownload: (() => void) | null = null;
		onError("");
		setProgress(0);
		setPhase("downloading");
		const download = downloadFileWithProgress(fileUrl, (percent) => {
			if (!disposed) setProgress(percent);
		});
		abortDownload = download.abort;
		void download.promise
			.then((blob) => {
				if (disposed || !containerRef.current) return;
				setPhase("rendering");
				const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
				const viewer = createViewer({
					target: containerRef.current,
					file,
					type,
					filename,
					theme: "light",
					locale: "zh-CN",
					toolbar: true,
					width: "100%",
					height: "100%",
					onLoad: () => {
						if (!disposed) setPhase("ready");
					},
					onError: (err) => onError(err?.message || "文件预览失败"),
				});
				viewerRef.current = viewer;
				return viewer.mount();
			})
			.catch((err: unknown) => {
				if (disposed) return;
				onError(err instanceof Error ? err.message : "文件预览失败");
			});
		return () => {
			disposed = true;
			abortDownload?.();
			viewerRef.current?.destroy();
			viewerRef.current = null;
		};
	}, [fileUrl, filename, type, onError]);

	return (
		<div className="file-preview-page__viewer-wrap">
			{phase !== "ready" ? (
				<div className="file-preview-page__progress">
					<div className="file-preview-page__progress-title">{phase === "downloading" ? `文件下载中 ${progress}%` : "文件渲染中..."}</div>
					<div className="file-preview-page__progress-track">
						<div className="file-preview-page__progress-bar" style={{ width: `${phase === "downloading" ? progress : 100}%` }} />
					</div>
				</div>
			) : null}
			<div ref={containerRef} className="file-preview-page__viewer" />
		</div>
	);
}
