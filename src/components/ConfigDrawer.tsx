import type { ReactNode } from "react";
import { CircleCheck, Monitor, Moon, RotateCcw, Settings, Sun } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { themePalettes, type ThemePalette, defaultThemePalette } from "@/lib/theme-palettes";

export type SidebarVariantMode = "inset" | "floating" | "sidebar";
export type SidebarCollapsibleMode = "offcanvas" | "icon" | "none";

type ConfigDrawerProps = {
  variant: SidebarVariantMode;
  setVariant: (variant: SidebarVariantMode) => void;
  collapsible: SidebarCollapsibleMode;
  setCollapsible: (mode: SidebarCollapsibleMode) => void;
  resetLayoutSettings: () => void;
};

type OptionItem<T extends string> = {
  value: T;
  label: string;
  preview: ReactNode;
};

function SectionTitle({
  title,
  showReset = false,
  onReset
}: {
  title: string;
  showReset?: boolean;
  onReset?: () => void;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
      {title}
      {showReset && onReset ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="size-4 rounded-full"
          onClick={onReset}
        >
          <RotateCcw className="size-3" />
        </Button>
      ) : null}
    </div>
  );
}

function OptionGrid<T extends string>({
  value,
  onChange,
  options,
  className
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<OptionItem<T>>;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-3 gap-4", className)}>
      {options.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className="group text-left outline-none"
          >
            <div
              className={cn(
                "relative rounded-[6px] ring-[1px] ring-border transition duration-200 ease-in",
                active ? "ring-primary shadow-2xl" : ""
              )}
            >
              <CircleCheck
                className={cn(
                  "absolute right-0 top-0 size-6 -translate-y-1/2 translate-x-1/2 fill-primary stroke-white",
                  active ? "" : "hidden"
                )}
              />
              {item.preview}
            </div>
            <div className="mt-1 text-xs">{item.label}</div>
          </button>
        );
      })}
    </div>
  );
}

const DEFAULT_THEME = "system" as const;
const DEFAULT_VARIANT: SidebarVariantMode = "inset";
const DEFAULT_COLLAPSIBLE: SidebarCollapsibleMode = "icon";

export function ConfigDrawer({
  variant,
  setVariant,
  collapsible,
  setCollapsible,
  resetLayoutSettings
}: ConfigDrawerProps) {
  const { theme, setTheme, palette, setPalette } = useTheme();
  const { open, setOpen } = useSidebar();
  const { locale, t } = useI18n();

  const isZh = locale === "zh-CN";
  const text = {
    openSettingsAria: isZh ? "打开主题设置" : "Open theme settings",
    title: isZh ? "主题设置" : "Theme Settings",
    description: isZh
      ? "按你的偏好调整主题与布局。"
      : "Adjust the appearance and layout to suit your preferences.",
    sectionTheme: isZh ? "主题" : "Theme",
    sectionSidebar: isZh ? "侧边栏" : "Sidebar",
    sectionLayout: isZh ? "布局" : "Layout",
    sectionPalette: t("theme.palette.title"),
    reset: isZh ? "重置" : "Reset",
    themeSystem: t("theme.system"),
    themeLight: t("theme.light"),
    themeDark: t("theme.dark"),
    inset: isZh ? "内嵌" : "Inset",
    floating: isZh ? "浮动" : "Floating",
    sidebar: isZh ? "标准" : "Sidebar",
    layoutDefault: isZh ? "默认" : "Default",
    layoutCompact: isZh ? "紧凑" : "Compact",
    layoutFull: isZh ? "全布局" : "Full layout"
  };

  const getPaletteLabel = (value: ThemePalette) => {
    if (value === "shadcn-admin") return t("theme.palette.shadcnAdmin");
    if (value === "zinc") return t("theme.palette.zinc");
    if (value === "slate") return t("theme.palette.slate");
    if (value === "stone") return t("theme.palette.stone");
    return t("theme.palette.skyimage");
  };

  const layoutRadioState: "default" | "icon" | "offcanvas" = open
    ? "default"
    : collapsible === "offcanvas"
    ? "offcanvas"
    : "icon";

  const handleResetAll = () => {
    setOpen(true);
    setTheme(DEFAULT_THEME);
    setPalette(defaultThemePalette);
    resetLayoutSettings();
  };

  const themeOptions: Array<OptionItem<"system" | "light" | "dark">> = [
    {
      value: "system",
      label: text.themeSystem,
      preview: <div className="flex h-14 items-center justify-center"><Monitor className="size-5" /></div>
    },
    {
      value: "light",
      label: text.themeLight,
      preview: <div className="flex h-14 items-center justify-center"><Sun className="size-5" /></div>
    },
    {
      value: "dark",
      label: text.themeDark,
      preview: <div className="flex h-14 items-center justify-center"><Moon className="size-5" /></div>
    }
  ];

  const sidebarOptions: Array<OptionItem<SidebarVariantMode>> = [
    {
      value: "inset",
      label: text.inset,
      preview: <div className="h-14 rounded-md bg-muted/60 p-2"><div className="h-full w-6 rounded bg-primary/60" /></div>
    },
    {
      value: "floating",
      label: text.floating,
      preview: <div className="h-14 rounded-md bg-muted/60 p-2"><div className="h-full w-6 rounded border bg-background" /></div>
    },
    {
      value: "sidebar",
      label: text.sidebar,
      preview: <div className="h-14 rounded-md bg-muted/60 p-2"><div className="h-full w-6 bg-primary/80" /></div>
    }
  ];

  const layoutOptions: Array<OptionItem<"default" | "icon" | "offcanvas">> = [
    {
      value: "default",
      label: text.layoutDefault,
      preview: <div className="h-14 rounded-md bg-muted/60 p-2"><div className="h-full rounded bg-primary/30" /></div>
    },
    {
      value: "icon",
      label: text.layoutCompact,
      preview: <div className="h-14 rounded-md bg-muted/60 p-2"><div className="h-full w-4 rounded bg-primary/70" /></div>
    },
    {
      value: "offcanvas",
      label: text.layoutFull,
      preview: <div className="h-14 rounded-md bg-muted/60 p-2"><div className="h-full rounded border border-dashed" /></div>
    }
  ];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={text.openSettingsAria} className="rounded-full">
          <Settings aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col">
        <SheetHeader className="pb-0 text-start">
          <SheetTitle>{text.title}</SheetTitle>
          <SheetDescription>{text.description}</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 overflow-y-auto px-4">
          <div>
            <SectionTitle
              title={text.sectionTheme}
              showReset={theme !== DEFAULT_THEME}
              onReset={() => setTheme(DEFAULT_THEME)}
            />
            <OptionGrid value={theme} onChange={setTheme} options={themeOptions} />
          </div>

          <div>
            <SectionTitle
              title={text.sectionPalette}
              showReset={palette !== defaultThemePalette}
              onReset={() => setPalette(defaultThemePalette)}
            />
            <div className="grid gap-2">
              {themePalettes.map((item) => {
                const active = palette === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setPalette(item.value)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition",
                      active
                        ? "border-primary bg-primary/5 ring-2 ring-ring/20"
                        : "border-border hover:border-primary/60"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{getPaletteLabel(item.value)}</span>
                      <div className="flex overflow-hidden rounded-full border border-border">
                        {item.swatches.map((swatch) => (
                          <span
                            key={swatch}
                            className="h-5 w-5"
                            style={{ backgroundColor: `hsl(${swatch})` }}
                          />
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-md:hidden">
            <SectionTitle
              title={text.sectionSidebar}
              showReset={variant !== DEFAULT_VARIANT}
              onReset={() => setVariant(DEFAULT_VARIANT)}
            />
            <OptionGrid value={variant} onChange={setVariant} options={sidebarOptions} />
          </div>

          <div className="max-md:hidden">
            <SectionTitle
              title={text.sectionLayout}
              showReset={layoutRadioState !== "default"}
              onReset={() => {
                setOpen(true);
                setCollapsible(DEFAULT_COLLAPSIBLE);
              }}
            />
            <OptionGrid
              value={layoutRadioState}
              onChange={(next) => {
                if (next === "default") {
                  setOpen(true);
                  return;
                }
                setOpen(false);
                setCollapsible(next);
              }}
              options={layoutOptions}
            />
          </div>
        </div>
        <SheetFooter className="gap-2">
          <Button variant="destructive" onClick={handleResetAll}>
            {text.reset}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}