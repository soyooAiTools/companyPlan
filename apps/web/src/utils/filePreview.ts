export type PreviewFileType = "pdf" | "word" | "excel" | "ppt";

const WORD_EXTENSIONS = new Set(["doc", "docx"]);
const EXCEL_EXTENSIONS = new Set(["xls", "xlsx", "csv"]);
const PPT_EXTENSIONS = new Set(["ppt", "pptx"]);

export function fileExtensionOf(filenameOrUrl: string): string {
	const clean = String(filenameOrUrl || "").split("?")[0].split("#")[0];
	const match = clean.toLowerCase().match(/\.([a-z0-9]{1,10})$/);
	return match?.[1] || "";
}

export function previewTypeOf(filename: string, mime?: string, url?: string): PreviewFileType | null {
	const ext = fileExtensionOf(filename) || fileExtensionOf(url || "");
	const normalizedMime = String(mime || "").toLowerCase();
	if (ext === "pdf" || normalizedMime === "application/pdf") return "pdf";
	if (WORD_EXTENSIONS.has(ext) || normalizedMime.includes("wordprocessingml") || normalizedMime === "application/msword") return "word";
	if (EXCEL_EXTENSIONS.has(ext) || normalizedMime.includes("spreadsheetml") || normalizedMime === "application/vnd.ms-excel" || normalizedMime === "text/csv") return "excel";
	if (PPT_EXTENSIONS.has(ext) || normalizedMime.includes("presentationml") || normalizedMime === "application/vnd.ms-powerpoint") return "ppt";
	return null;
}

export function buildFilePreviewUrl({ url, filename, type, size }: { url: string; filename: string; type?: PreviewFileType | null; size?: number }) {
	const params = new URLSearchParams();
	params.set("url", url);
	params.set("filename", filename || "附件");
	if (type) params.set("type", type);
	if (size && size > 0) params.set("size", String(size));
	const path = `/file-preview?${params.toString()}`;
	return typeof window === "undefined" ? path : `${window.location.origin}${path}`;
}
