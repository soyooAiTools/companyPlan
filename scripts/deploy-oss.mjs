import OSS from "ali-oss";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "..", "apps", "web", "dist");

const { OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_REGION, OSS_BUCKET } = process.env;
for (const [k, v] of Object.entries({ OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_REGION, OSS_BUCKET })) {
	if (!v) {
		console.error(`[deploy-oss] 缺少环境变量 ${k}`);
		process.exit(1);
	}
}

const NO_CACHE = new Set(["index.html", "version.json"]); // 不缓存,新版本立即生效;其余带 hash 资源强缓存

const client = new OSS({
	region: OSS_REGION,
	accessKeyId: OSS_ACCESS_KEY_ID,
	accessKeySecret: OSS_ACCESS_KEY_SECRET,
	bucket: OSS_BUCKET,
	secure: true,
});

async function walk(dir, base = dir) {
	const out = [];
	for (const name of await readdir(dir)) {
		const full = path.join(dir, name);
		const s = await stat(full);
		if (s.isDirectory()) out.push(...(await walk(full, base)));
		else out.push(path.relative(base, full).split(path.sep).join("/"));
	}
	return out;
}

async function main() {
	let files;
	try {
		files = await walk(DIST);
	} catch {
		console.error(`[deploy-oss] 找不到构建产物 ${DIST},请先 pnpm build`);
		process.exit(1);
	}
	if (!files.length) {
		console.error(`[deploy-oss] ${DIST} 为空`);
		process.exit(1);
	}

	console.log(`[deploy-oss] 上传 ${files.length} 个文件 → oss://${OSS_BUCKET} (${OSS_REGION})`);
	for (const rel of files) {
		const cacheControl = NO_CACHE.has(rel) ? "no-cache" : "public, max-age=31536000, immutable";
		await client.put(rel, path.join(DIST, rel), { headers: { "Cache-Control": cacheControl } });
		console.log(`  ✓ ${rel}`);
	}
	console.log(`[deploy-oss] 完成 ✅ 共 ${files.length} 个文件`);
}

main().catch((e) => {
	console.error("[deploy-oss] 失败:", e?.message || e);
	process.exit(1);
});
