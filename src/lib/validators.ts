import { z } from "zod";
import { onlyDigits } from "./format";

const phone = z
  .string()
  .transform(onlyDigits)
  .refine((v) => v.length >= 10 && v.length <= 11, "Informe o WhatsApp com DDD.");

export const checkoutSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome."),
    phone,
    fulfillment: z.enum(["delivery", "pickup"]),
    zip: z.string(),
    street: z.string().trim(),
    number: z.string().trim(),
    complement: z.string().trim(),
    neighborhood: z.string().trim(),
    city: z.string().trim(),
    reference: z.string().trim(),
    payment_method: z.enum(["pix", "credit", "debit", "cash"]),
    change_for: z.number().nullable(),
    notes: z.string().trim().max(300),
  })
  .superRefine((v, ctx) => {
    if (v.fulfillment === "delivery") {
      const required = { street: "Informe a rua.", number: "Informe o número.", neighborhood: "Informe o bairro.", city: "Informe a cidade." } as const;
      for (const [key, message] of Object.entries(required)) {
        if (!v[key as keyof typeof required]) ctx.addIssue({ code: "custom", path: [key], message });
      }
    }
    if (v.change_for !== null && Number.isNaN(v.change_for)) {
      ctx.addIssue({ code: "custom", path: ["change_for"], message: "Valor inválido." });
    }
  });

export type CheckoutInput = z.input<typeof checkoutSchema>;

export const productSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do produto."),
  description: z.string().trim().max(400),
  price: z.number({ error: "Preço inválido." }).min(0, "Preço inválido.").max(100000),
  category_id: z.string().min(1, "Escolha uma categoria."),
});

export const staffSchema = z.object({
  full_name: z.string().trim().min(2, "Informe o nome."),
  email: z.email("E-mail inválido.").trim().toLowerCase(),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
  role: z.enum(["admin", "staff"]),
});

/** Turns zod issues into { field: message } for inline errors. */
export function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
