// 阿里云 OSS 上传(富文本编辑器图片/视频/附件等资源)。凭证从环境变量读(见 .env.dev 的 OSS_*)。
// 公开直链:https://{bucket}.{region}.aliyuncs.com/{baseDir}/{项目id}/{uuid}.{ext}
import crypto from "node:crypto";
import OSSImport from "ali-oss";
import { ossConfig } from "../config/runtime.mjs";

const OSS = OSSImport?.default ?? OSSImport; // ali-oss 是 CJS,兼容默认导出

let client = null;

export function isOssConfigured() {
	return Boolean(ossConfig.accessKeyId && ossConfig.accessKeySecret && ossConfig.bucket && ossConfig.region);
}

function getClient() {
	if (!isOssConfigured()) return null;
	if (!client) {
		client = new OSS({
			region: ossConfig.region,
			accessKeyId: ossConfig.accessKeyId,
			accessKeySecret: ossConfig.accessKeySecret,
			bucket: ossConfig.bucket,
			secure: true,
		});
	}
	return client;
}

// 目录名清洗(项目 id):仅去掉路径分隔符,保留中划线/字母数字;空则用"未分配"
function sanitizeFolder(id) {
	const s = String(id ?? "")
		.replace(/[/\\]+/g, "")
		.trim();
	return s || "未分配";
}

const EXT_BY_MIME = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/svg+xml": "svg",
	"image/bmp": "bmp",
	"video/mp4": "mp4",
	"video/webm": "webm",
	"video/quicktime": "mov",
	"application/zip": "zip",
	"application/x-zip-compressed": "zip",
};

// 扩展名:优先取原文件名后缀,其次按 mime 猜,最后 bin
function extOf(filename, mime) {
	const m = String(filename || "")
		.toLowerCase()
		.match(/\.([a-z0-9]{1,8})$/);
	if (m) return m[1];
	return EXT_BY_MIME[String(mime || "").toLowerCase()] || "bin";
}

// 上传 Buffer → 返回公开 URL。projectId 作为路径中的一级目录。
export async function uploadObject({ projectId, filename, buffer, mime }) {
	const oss = getClient();
	if (!oss) throw new Error("OSS 未配置(缺少 AccessKey)");
	const ext = extOf(filename, mime);
	const key = `${ossConfig.baseDir}/${sanitizeFolder(projectId)}/${crypto.randomUUID()}.${ext}`;
	await oss.put(key, buffer);
	// 路径段按 UTF-8 转义,保证中文等也能直接用作 <img src>
	const encoded = key.split("/").map(encodeURIComponent).join("/");
	return `https://${ossConfig.bucket}.${ossConfig.region}.aliyuncs.com/${encoded}`;
}
