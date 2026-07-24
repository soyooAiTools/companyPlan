import imageCompression from "browser-image-compression";

const COMPRESSIBLE_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export async function compressImageForUpload(file: File, maxBytes: number): Promise<File> {
  if (!COMPRESSIBLE_IMAGE_TYPES.has(file.type.toLowerCase())) return file;

  try {
    return await imageCompression(file, {
      maxSizeMB: maxBytes / 1024 / 1024,
      maxWidthOrHeight: 2560,
      useWebWorker: true,
      initialQuality: 0.82,
      alwaysKeepResolution: false,
    });
  } catch {
    return file;
  }
}
