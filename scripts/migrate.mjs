// Applies db/schema.sql (idempotent).
// Usage: npm run db:migrate
import { readFile } from "node:fs/promises";
import { db } from "./db.mjs";

const sql = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
await db.query(sql);
console.log("Schema aplicado.");
await db.end();
