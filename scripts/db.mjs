// Shared Postgres client for the CLI scripts. Prefers the direct (unpooled)
// connection, which Neon recommends for migrations and admin tasks.
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL no .env.local. Rode `neon deploy` (ou `neon env pull`) na pasta do projeto.");
  process.exit(1);
}

// same as src/lib/db.ts: verify-full explicitly, so pg doesn't warn about sslmode=require
export const db = new pg.Client({ connectionString: url.replace(/([?&])sslmode=(?:prefer|require|verify-ca)/, "$1sslmode=verify-full") });
await db.connect();
