// Pure cost rules, shared by the Custos page, the order snapshot and the dashboard.

import type { CostInput, CostInputKind, CostLine, CostSettings, ExpenseCategory, OperatingExpense, ProductCost } from "@/types";

export const round4 = (n: number) => Math.round(n * 10000) / 10000;

export const INPUT_KIND: Record<CostInputKind, { label: string; plural: string }> = {
  ingredient: { label: "Ingrediente", plural: "Ingredientes" },
  packaging: { label: "Embalagem", plural: "Embalagens" },
  other: { label: "Outro", plural: "Outros" },
};

export const EXPENSE_CATEGORY: Record<ExpenseCategory, string> = {
  gas: "Gás",
  energy: "Energia elétrica",
  water: "Água",
  rent: "Aluguel",
  staff: "Funcionários",
  internet: "Internet e telefone",
  marketing: "Marketing",
  taxes: "Impostos e taxas",
  maintenance: "Manutenção",
  other: "Outros",
};

/** Cost of one unit of the input (one g, one ml, one un…). */
export const inputUnitCost = (input: Pick<CostInput, "package_size" | "package_price">) =>
  input.package_size > 0 ? input.package_price / input.package_size : 0;

/** R$ with up to 4 decimals, for small unit costs (R$ 0,0040/g). */
const brl4 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });
export const formatUnitCost = (n: number) => brl4.format(n);

type Inputs = Map<string, Pick<CostInput, "package_size" | "package_price">>;

/** What the line costs as written (for the whole recipe when per = batch). */
export function lineCost(line: CostLine, inputs: Inputs) {
  if (line.input_id) {
    const input = inputs.get(line.input_id);
    return input ? (line.quantity ?? 0) * inputUnitCost(input) : 0;
  }
  return line.amount ?? 0;
}

/** Cost of the line inside one unit of the product. */
export const linePerUnit = (line: CostLine, recipeYield: number, inputs: Inputs) =>
  line.per === "batch" ? lineCost(line, inputs) / (recipeYield > 0 ? recipeYield : 1) : lineCost(line, inputs);

/** Cost of one unit from the recipe: inputs (ingredients, packaging) and free lines (gas, labor…). */
export function variableCost(recipe: Pick<ProductCost, "yield" | "lines">, inputs: Inputs) {
  let fromInputs = 0;
  let extras = 0;
  for (const line of recipe.lines) {
    const n = linePerUnit(line, recipe.yield, inputs);
    if (line.input_id) fromInputs += n;
    else extras += n;
  }
  return { inputs: round4(fromInputs), extras: round4(extras), total: round4(fromInputs + extras) };
}

/** "YYYY-MM" of a "YYYY-MM-DD" date. */
export const monthOf = (date: string) => date.slice(0, 7);

/** Active monthly expenses plus the one-off ones dated in `month` ("YYYY-MM"). */
export function monthExpenses(expenses: OperatingExpense[], month: string) {
  return expenses.filter((e) => (e.recurring ? e.active : e.date !== null && monthOf(e.date) === month));
}

export const fixedMonthly = (expenses: OperatingExpense[], month: string) =>
  round4(monthExpenses(expenses, month).reduce((n, e) => n + e.amount, 0));

/** Units the monthly expenses are shared by; null when there is no base yet. */
export const productionBase = (settings: CostSettings, soldLast30: number) => settings.monthly_units ?? (soldLast30 > 0 ? soldLast30 : null);

export interface CostBreakdown {
  inputs: number;
  extras: number;
  variable: number;
  /** Share of the monthly expenses (0 when the recipe leaves them out). */
  fixed: number;
  /** Taxes and card fees on the price. */
  sales: number;
  total: number;
  profit: number;
  /** % of the price; null without a price. */
  margin: number | null;
  /** Price that reaches the target margin; null when taxes and target leave no room. */
  suggested: number | null;
}

export function costBreakdown(
  price: number,
  recipe: Pick<ProductCost, "yield" | "lines" | "include_fixed">,
  inputs: Inputs,
  fixedPerUnit: number,
  settings: Pick<CostSettings, "target_margin" | "sales_pct">,
): CostBreakdown {
  const v = variableCost(recipe, inputs);
  const fixed = recipe.include_fixed ? round4(fixedPerUnit) : 0;
  const sales = round4((price * settings.sales_pct) / 100);
  const total = round4(v.total + fixed + sales);
  const room = 1 - settings.target_margin / 100 - settings.sales_pct / 100;
  return {
    inputs: v.inputs,
    extras: v.extras,
    variable: v.total,
    fixed,
    sales,
    total,
    profit: round4(price - total),
    margin: price > 0 ? ((price - total) / price) * 100 : null,
    suggested: room > 0 ? Math.ceil(((v.total + fixed) / room) * 100) / 100 : null,
  };
}
