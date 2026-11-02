import "server-only";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;

/**
 * Checks an uploaded screenshot by size, declared type and file signature,
 * so a file cannot claim to be an image it is not. Returns the extension to
 * store it under, or a message for the user.
 */
export async function checkImage(file: FormDataEntryValue | null): Promise<{ file: File; ext: string } | { error: string }> {
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "Images must be 5 MB or smaller." };
  const ext = ALLOWED_TYPES[file.type as keyof typeof ALLOWED_TYPES];
  if (!ext) return { error: "Use a PNG, JPEG or WebP image." };

  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isWebp = String.fromCharCode(...head.slice(0, 4)) === "RIFF" && String.fromCharCode(...head.slice(8, 12)) === "WEBP";
  if (!({ png: isPng, jpg: isJpeg, webp: isWebp })[ext]) return { error: "That file is not a valid image." };
  return { file, ext };
}
