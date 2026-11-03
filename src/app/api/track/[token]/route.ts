import { connection } from "next/server";
import { query } from "@/lib/db";
import { ORDER_COLUMNS, orderFromRow, toPublicOrder } from "@/lib/orders";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public: whoever holds the order's random token can read its status. There is
// no way to list orders, and the phone number is never returned.
export async function GET(_request: Request, ctx: RouteContext<"/api/track/[token]">) {
  await connection();
  const { token } = await ctx.params;
  if (!UUID.test(token)) return Response.json({ error: "not_found" }, { status: 404 });

  const [row] = await query(`select ${ORDER_COLUMNS} from orders where public_token = $1`, [token]);
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ order: toPublicOrder(orderFromRow(row)) }, { headers: { "cache-control": "no-store" } });
}
