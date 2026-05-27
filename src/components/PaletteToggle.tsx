import { Palette } from "lucide-react";

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

export function PaletteToggle() {
  const { palette, setPalette } = useTheme();
  const { t } = useI18n();

  return (
    <Select value={palette} onValueChange={setPalette}>
      <SelectTrigger className="h-9 w-[148px] gap-2 px-3">
        <Palette className="h-4 w-4 text-muted-foreground" />
        <SelectValue placeholder={t("theme.palette.title")} />
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