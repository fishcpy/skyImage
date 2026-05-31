import { Moon, Sun, Monitor } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useTheme } from "@/components/ThemeProvider";
import { useAuthStore } from "@/state/auth";
import { updateAccountProfile } from "@/lib/api";
import { useI18n } from "@/i18n";

type ThemeToggleProps = {
  iconOnly?: boolean;
};

export function ThemeToggle({ iconOnly = false }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const user = useAuthStore((state) => state.user);
  const { t } = useI18n();
  const currentValue = theme ?? "system";

  const handleThemeChange = async (value: "light" | "dark" | "system") => {
    setTheme(value);

    if (user) {
      try {
        await updateAccountProfile({
          name: user.name,
          url: user.url ?? "",
          theme: value
        });
        await useAuthStore.getState().refreshUser();
      } catch (error) {
        console.error("[ThemeToggle] Failed to update theme preference:", error);
      }
    }
  };

  const icon =
    currentValue === "system"
      ? Monitor
      : resolvedTheme === "dark"
      ? Moon
      : Sun;
  const Icon = icon;

  return (
    <Select value={currentValue} onValueChange={handleThemeChange}>
      <SelectTrigger
        className={iconOnly ? "h-9 w-9 justify-center px-0 border-0 shadow-none" : "h-9 w-[140px] gap-2 px-3"}
        aria-label={t("theme.placeholder")}
      >
        <Icon className="h-4 w-4" />
        {!iconOnly ? <SelectValue placeholder={t("theme.placeholder")} /> : null}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="system">{t("theme.system")}</SelectItem>
        <SelectItem value="light">{t("theme.light")}</SelectItem>
        <SelectItem value="dark">{t("theme.dark")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
