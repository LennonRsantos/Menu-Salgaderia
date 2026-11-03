// Creates (or promotes) a manager account.
// Usage: npm run create-admin -- email@loja.com "senha-forte" "Nome do gerente"
//
// The account is created through Neon Auth's sign-up endpoint, then gets the
// Better Auth "admin" role (needed for the team screen) and a `staff` row.
import { db } from "./db.mjs";

const [rawEmail, password, ...nameParts] = process.argv.slice(2);
const email = (rawEmail ?? "").trim().toLowerCase();
const fullName = nameParts.join(" ").trim() || "Gerente";
const authUrl = process.env.NEON_AUTH_BASE_URL;

if (!email || !password || password.length < 8) {
  console.error('Uso: npm run create-admin -- email@loja.com "senha com 8+ caracteres" "Nome"');
  process.exit(1);
}
if (!authUrl) {
  console.error("Falta NEON_AUTH_BASE_URL no .env.local. Rode `neon deploy` na pasta do projeto.");
  process.exit(1);
}

const findUser = async () => (await db.query(`select id from neon_auth."user" where lower(email) = $1`, [email])).rows[0];

let user = await findUser();
if (user) {
  console.log(`Conta existente: ${email}. A senha não foi alterada (troque pelo painel em Equipe).`);
} else {
  const res = await fetch(`${authUrl.replace(/\/$/, "")}/sign-up/email`, {
    method: "POST",
    // localhost origins are trusted by Neon Auth by default
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ email, password, name: fullName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(`Neon Auth recusou o cadastro (${res.status}): ${body.message ?? body.code ?? "erro desconhecido"}`);
    process.exit(1);
  }
  user = await findUser();
  if (!user) {
    console.error("A conta foi criada, mas não apareceu no banco. Confira se DATABASE_URL e NEON_AUTH_BASE_URL são do mesmo branch.");
    process.exit(1);
  }
  console.log(`Conta criada: ${email}`);
}

await db.query(`update neon_auth."user" set role = 'admin', name = $2, banned = false where id = $1`, [user.id, fullName]);
await db.query(
  `insert into staff (user_id, full_name, email, role, active) values ($1, $2, $3, 'admin', true)
   on conflict (user_id) do update set full_name = excluded.full_name, email = excluded.email, role = 'admin', active = true`,
  [user.id, fullName, email],
);
console.log("Perfil de gerente ativo. Entre em /admin/login.");
await db.end();
