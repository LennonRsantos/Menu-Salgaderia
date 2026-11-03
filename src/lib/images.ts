// Photos uploaded from the panel live in the `images` table and are served by
// GET /api/images/<id>. Shared by the server action, the route and the forms.

export const IMAGE_MAX_BYTES = 800_000;
export const IMAGE_PATH = /^\/api\/images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const imagePath = (id: string) => `/api/images/${id}`;

/** Real type from the file's first bytes; the name and the browser's claim are ignored. */
export function sniffImageType(bytes: Uint8Array): "image/webp" | "image/jpeg" | "image/png" | null {
  const at = (i: number, ...sig: number[]) => sig.every((b, k) => bytes[i + k] === b);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}
