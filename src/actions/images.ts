"use server";

import { requireStaff } from "@/lib/auth";
import { query } from "@/lib/db";
import { IMAGE_MAX_BYTES, imagePath, sniffImageType } from "@/lib/images";
import type { MenuActionResult } from "./menu";

/**
 * Stores a photo sent from the panel and returns the path to save in
 * `products.image_url`, `store_settings.logo_url` or `store_settings.header_image_url`.
 */
export async function uploadImage(form: FormData): Promise<MenuActionResult<{ url: string }>> {
  try {
    await requireStaff();
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: "Escolha uma imagem." };
    if (file.size > IMAGE_MAX_BYTES) return { ok: false, error: "Imagem grande demais. Tente outra foto." };

    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImageType(bytes);
    if (!type) return { ok: false, error: "Formato não suportado. Use JPG, PNG ou WebP." };

    const [row] = await query<{ id: string }>("insert into images (content_type, data) values ($1, $2) returning id", [
      type,
      Buffer.from(bytes),
    ]);
    await removeOrphans();
    return { ok: true, data: { url: imagePath(row.id) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível enviar a imagem." };
  }
}

// Photos replaced or removed in a form stay unreferenced. The one-day grace keeps
// an upload whose form was not saved yet.
async function removeOrphans() {
  await query(
    `delete from images i
      where i.created_at < now() - interval '1 day'
        and not exists (select 1 from products p where p.image_url = '/api/images/' || i.id)
        and not exists (
          select 1 from store_settings s
           where s.logo_url = '/api/images/' || i.id or s.header_image_url = '/api/images/' || i.id
        )`,
  );
}
