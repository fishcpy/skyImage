import { Palette } from "lucide-react";
import { useLocation } from "react-router-dom";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useTheme } from "@/components/ThemeProvider";
import { useI18n } from "@/i18n";
import { themePalettes } from "@/lib/theme-palettes";

type PaletteToggleProps = {
  iconOnly?: boolean;
};

export function PaletteToggle({ iconOnly = false }: PaletteToggleProps) {
  const { palette, setPalette } = useTheme();
  const { t } = useI18n();
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <Select value={palette} onValueChange={setPalette}>
      <SelectTrigger
        className={iconOnly ? "h-9 w-9 justify-center px-0 border-0 shadow-none" : "h-9 w-[148px] gap-2 px-3"}
        aria-label={t("theme.palette.title")}
      >
        <Palette className={`h-4 w-4 ${isHome ? "text-foreground" : "text-muted-foreground"}`} />
        {!iconOnly ? <SelectValue placeholder={t("theme.palette.title")} /> : null}
      </SelectTrigger>
      <SelectContent>
        {themePalettes.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {t(item.labelKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}