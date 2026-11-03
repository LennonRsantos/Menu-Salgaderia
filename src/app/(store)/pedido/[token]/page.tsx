import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderTracker, TrackerSkeleton } from "@/components/store/order-tracker";
import { getStoreSettings } from "@/lib/menu";

export const metadata: Metadata = { title: "Acompanhar pedido", robots: { index: false } };

export default function TrackOrderPage({ params }: PageProps<"/pedido/[token]">) {
  return (
    <Suspense fallback={<TrackerSkeleton />}>
      <Tracker params={params} />
    </Suspense>
  );
}

async function Tracker({ params }: { params: PageProps<"/pedido/[token]">["params"] }) {
  const [{ token }, settings] = await Promise.all([params, getStoreSettings()]);
  return <OrderTracker token={token} settings={settings} />;
}
