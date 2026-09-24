import noPermissionImage from "@/assets/image-no-permission.png";

const RESTRICTED_IMAGE_HOSTS = new Set(["alidocs.dingtalk.com"]);

function getImageHost(src: string) {
	try {
		return new URL(src, window.location.href).hostname.toLowerCase();
	} catch {
		return "";
	}
}

function replaceFailedImage(image: HTMLImageElement) {
	if (image.dataset.opsImageFallback === "true") return;
	image.dataset.opsImageFallback = "true";
	const host = getImageHost(image.currentSrc || image.src);
	const message = RESTRICTED_IMAGE_HOSTS.has(host) ? "钉钉图片无权限或已过期" : "图片加载失败，可能无权限";
	image.alt = message;
	image.classList.add("ops-image-load-failed");
	image.src = noPermissionImage;
}

export function bindImageLoadFallback(container: HTMLElement | null) {
	if (!container) return () => {};

	const images = Array.from(container.querySelectorAll<HTMLImageElement>("img"));
	const cleanups = images.map((image) => {
		const onError = () => replaceFailedImage(image);
		image.addEventListener("error", onError);
		if (image.complete && image.naturalWidth === 0) onError();
		return () => image.removeEventListener("error", onError);
	});

	return () => cleanups.forEach((cleanup) => cleanup());
}
