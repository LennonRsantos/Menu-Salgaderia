import { Storefront } from "@/components/store/storefront";
import { getActiveTheme, getMenu, getStoreSettings } from "@/lib/menu";

export default async function MenuPage() {
  const [menu, settings, theme] = await Promise.all([getMenu(), getStoreSettings(), getActiveTheme()]);
  return <Storefront menu={menu} settings={settings} theme={theme} />;
}
