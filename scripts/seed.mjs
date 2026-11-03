// Loads the store settings and a sample salgaderia menu.
// Usage: npm run seed            (refuses to run if there are categories already)
//        npm run seed -- --force (adds the sample menu anyway)
import { db } from "./db.mjs";

const force = process.argv.includes("--force");
const { rowCount } = await db.query("select 1 from categories limit 1");
if (rowCount && !force) {
  console.error("Já existem categorias. Use `npm run seed -- --force` para adicionar o cardápio de exemplo mesmo assim.");
  process.exit(1);
}

const id = () => crypto.randomUUID();
const group = (name, min, max, addons) => ({
  id: id(),
  name,
  min_select: min,
  max_select: max,
  addons: addons.map(([addonName, price], position) => ({ id: id(), name: addonName, price, is_available: true, position })),
});

const menu = [
  ["Salgados fritos", [
    ["Coxinha de frango", "Massa de batata, recheio cremoso de frango com catupiry.", 7.5, [group("Molho", 0, 2, [["Molho de alho", 1.5], ["Molho picante", 1.5], ["Ketchup", 0]])]],
    ["Kibe", "Carne bovina temperada com hortelã.", 7, [group("Recheio", 0, 1, [["Com catupiry", 2], ["Com queijo", 2]])]],
    ["Risole de queijo e presunto", "Massa leve, empanada e crocante.", 7],
    ["Bolinha de queijo", "Muçarela derretendo por dentro.", 6.5],
    ["Pastel de carne", "Carne moída, azeitona e ovo.", 9],
  ]],
  ["Salgados assados", [
    ["Esfiha de carne", "Aberta, massa macia e carne temperada.", 6],
    ["Esfiha de queijo", "Aberta, com muçarela e orégano.", 6],
    ["Enroladinho de salsicha", "Massa de pão assada, salsicha inteira.", 6.5],
    ["Empada de palmito", "Massa podre que derrete na boca.", 8],
  ]],
  ["Combos e festas", [
    ["Cento de salgados mini", "100 mini salgados fritos sortidos. Escolha os sabores.", 75, [
      group("Sabores (até 4)", 1, 4, [["Coxinha", 0], ["Kibe", 0], ["Risole", 0], ["Bolinha de queijo", 0], ["Enroladinho", 0]]),
      group("Extras", 0, 2, [["Pote de molho de alho", 6], ["Embalagem para presente", 4]]),
    ]],
    ["Combo lanche", "2 salgados + refrigerante lata.", 18, [group("Refrigerante", 1, 1, [["Coca-Cola", 0], ["Guaraná", 0], ["Coca-Cola Zero", 0]])]],
  ]],
  ["Bebidas", [
    ["Refrigerante lata", "350 ml.", 6],
    ["Suco natural", "Laranja ou limão, 400 ml.", 8],
    ["Água mineral", "500 ml.", 3.5],
  ]],
  ["Doces", [
    ["Brigadeiro", "Tradicional, com granulado belga.", 3.5],
    ["Bolo de pote", "Ninho com morango.", 12],
  ]],
];

let productCount = 0;
await db.query("begin");
try {
  // never overwrite a store that is already configured
  await db.query(
    `insert into store_settings (id, name, tagline, phone, delivery_fee, min_order, is_open, opening_hours)
     values (1, 'Menu Salgaderia e Confeitaria', 'Salgados fresquinhos e doces caseiros', '11999999999', 6, 20, true, 'Ter a Dom, 10h às 22h')
     on conflict (id) do nothing`,
  );

  for (const [ci, [categoryName, products]] of menu.entries()) {
    const { rows } = await db.query("insert into categories (name, position) values ($1, $2) returning id", [categoryName, ci + 1]);
    for (const [pi, [name, description, price, groups = []]] of products.entries()) {
      productCount++;
      await db.query(
        `insert into products (category_id, name, description, price, position, addon_groups)
         values ($1, $2, $3, $4, $5, $6)`,
        [rows[0].id, name, description, price, pi + 1, JSON.stringify(groups.map((g, gi) => ({ ...g, position: gi })))],
      );
    }
  }
  await db.query("commit");
} catch (e) {
  await db.query("rollback");
  throw e;
}

console.log(`Seed concluído: ${menu.length} categorias e ${productCount} produtos.`);
await db.end();
