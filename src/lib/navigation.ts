import {
  Activity,
  Bell,
  Brush,
  CloudUpload,
  GaugeCircle,
  Image as ImageIcon,
  Info,
  Key,
  Layers3,
  LinkIcon,
  Package,
  Receipt,
  ServerCog,
  Settings2,
  ShieldAlert,
  ShoppingBag,
  LifeBuoy,
  Ticket,
  Users,
  Users2,
  type LucideIcon
} from "lucide-react";
import type { SiteConfig } from "@/lib/api";

type Translate = (key: string) => string;

export type NavNode = {
  title: string;
  url?: string;
  icon?: LucideIcon;
  items?: NavNode[];
};

export type NavSection = {
  title?: string;
  items: NavNode[];
};

export const buildNavSections = ({
  t,
  isAdmin,
  siteConfig
}: {
  t: Translate;
  isAdmin: boolean;
  siteConfig?: SiteConfig;
}): NavSection[] => {
  const enableGallery = siteConfig?.enableGallery ?? true;
  const enableApi = siteConfig?.enableApi ?? true;

  const sections: NavSection[] = [
    {
      items: [{ url: "/dashboard", title: t("nav.dashboard"), icon: GaugeCircle }]
    },
    {
      title: t("nav.mine"),
      items: [
        { url: "/dashboard/upload", title: t("nav.upload"), icon: CloudUpload },
        { url: "/dashboard/images", title: t("nav.images"), icon: ImageIcon },
        { url: "/dashboard/shop", title: t("nav.shop"), icon: ShoppingBag },
        { url: "/dashboard/orders", title: t("nav.orders"), icon: Receipt },
        { url: "/dashboard/tickets", title: t("nav.tickets"), icon: LifeBuoy },
        { url: "/dashboard/settings", title: t("nav.settings"), icon: Settings2 },
        { url: "/dashboard/notifications", title: t("nav.notifications"), icon: Bell }
      ]
    },
    {
      title: t("nav.public"),
      items: [
        { url: "/shop", title: t("nav.shop"), icon: ShoppingBag },
        ...(enableGallery
          ? [{ url: "/dashboard/gallery", title: t("nav.gallery"), icon: Brush }]
          : []),
        ...(enableApi
          ? [
              { url: "/dashboard/api", title: t("nav.apiDocs"), icon: LinkIcon },
              { url: "/dashboard/api-tokens", title: t("nav.apiTokens"), icon: Key }
            ]
          : []),
        { url: "/dashboard/about", title: t("nav.about"), icon: Info }
      ]
    }
  ];

  if (isAdmin) {
    sections.push({
      title: t("nav.system"),
      items: [
        { url: "/dashboard/admin/console", title: t("nav.console"), icon: Activity },
        { url: "/dashboard/admin/images", title: t("nav.adminImages"), icon: ImageIcon },
        { url: "/dashboard/admin/audits", title: t("nav.audits"), icon: ShieldAlert },
        { url: "/dashboard/admin/groups", title: t("nav.groups"), icon: Users },
        { url: "/dashboard/admin/redeem-codes", title: t("nav.redeemCodes"), icon: Ticket },
        { url: "/dashboard/admin/shop/products", title: t("nav.shopProducts"), icon: Package },
        { url: "/dashboard/admin/shop/orders", title: t("nav.shopOrders"), icon: Receipt },
        { url: "/dashboard/admin/tickets", title: t("nav.adminTickets"), icon: LifeBuoy },
        { url: "/dashboard/admin/users", title: t("nav.users"), icon: Users2 },
        { url: "/dashboard/admin/strategies", title: t("nav.strategies"), icon: Layers3 },
        {
          title: t("nav.systemSettings"),
          icon: ServerCog,
          items: [
            { url: "/dashboard/admin/settings/site", title: t("nav.siteSettings") },
            { url: "/dashboard/admin/settings/email", title: t("nav.emailSettings") },
            { url: "/dashboard/admin/settings/system", title: t("nav.systemSettings") },
            { url: "/dashboard/admin/settings/tickets", title: t("nav.ticketSettings") },
            { url: "/dashboard/admin/settings/captcha", title: t("nav.captchaSettings") },
            { url: "/dashboard/admin/settings/oauth", title: t("nav.oauthSettings") },
            { url: "/dashboard/admin/settings/payment", title: t("nav.paymentSettings") },
            { url: "/dashboard/admin/settings/database", title: t("nav.databaseSettings") }
          ]
        }
      ]
    });
  }

  return sections;
};