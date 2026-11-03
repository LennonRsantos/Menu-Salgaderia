import { connection } from "next/server";
import { requireStaff } from "@/lib/auth";
import { query } from "@/lib/db";
import { ORDER_COLUMNS, orderFromRow } from "@/lib/orders";

// Polled by the Kanban every few seconds: open orders of any day plus
// everything created today (São Paulo time), oldest first. Scheduled orders
// sort by their date, so the ones for later sit at the end of "Novos".
export async function GET() {
  await connection();
  try {
    await requireStaff();
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Sem acesso." }, { status: 401 });
  }
  const rows = await query(
    `select ${ORDER_COLUMNS} from orders
     where status in ('new', 'preparing', 'out_for_delivery')
        or created_at >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
     order by coalesce(scheduled_for, created_at)`,
  );
  return Response.json({ orders: rows.map(orderFromRow) }, { headers: { "cache-control": "no-store" } });
}
