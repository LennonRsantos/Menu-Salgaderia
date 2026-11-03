import { connection } from "next/server";
import { query } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public: product photos and the store logo. An id never changes content (a new
// photo gets a new id), so browsers and the CDN may keep it forever.
export async function GET(_request: Request, ctx: RouteContext<"/api/images/[id]">) {
  await connection();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });

  const [row] = await query<{ content_type: string; data: Buffer }>("select content_type, data from images where id = $1", [id]);
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: {
      "content-type": row.content_type,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
