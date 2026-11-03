import type { Metadata } from "next";
import { CheckoutForm } from "@/components/store/checkout-form";
import { getStoreSettings } from "@/lib/menu";

export const metadata: Metadata = { title: "Finalizar pedido" };

export default async function CheckoutPage() {
  const settings = await getStoreSettings();
  return <CheckoutForm settings={settings} />;
}
