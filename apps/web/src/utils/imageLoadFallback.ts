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
	const message = RESTRICTED_IMAGE_HOSTS.has(host) ? "该图片复制自钉钉，您可能没有查看权限" : "图片加载失败，可能无权限";
	image.alt = message;
	image.classList.add("ops-image-load-failed");
	image.src = noPermissionImage;
}

export function bindImageLoadFallback(container: HTMLElement | null) {
	if (!container) return () => {};

	const scanImages = () => {
		container.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
			if (image.complete && image.naturalWidth === 0) replaceFailedImage(image);
		});
	};
	const onError = (event: Event) => {
		if (event.target instanceof HTMLImageElement) replaceFailedImage(event.target);
	};
	const observer = new MutationObserver(scanImages);
	container.addEventListener("error", onError, true);
	observer.observe(container, { childList: true, subtree: true });
	scanImages();

	return () => {
		container.removeEventListener("error", onError, true);
		observer.disconnect();
	};
}
