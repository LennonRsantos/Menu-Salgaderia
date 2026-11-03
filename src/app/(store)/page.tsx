import { Storefront } from "@/components/store/storefront";
import { getMenu, getStoreSettings } from "@/lib/menu";

export default async function MenuPage() {
  const [menu, settings] = await Promise.all([getMenu(), getStoreSettings()]);
  return <Storefront menu={menu} settings={settings} />;
}
