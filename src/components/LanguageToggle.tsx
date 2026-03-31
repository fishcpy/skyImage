import { Languages } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useI18n, type Locale } from "@/i18n";

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();

  return (
    <Select value={locale} onValueChange={(value) => setLocale(value as Locale)}>
      <SelectTrigger className="h-9 w-[140px] gap-2 px-3">
        <Languages className="h-4 w-4 text-muted-foreground" />
        <SelectValue placeholder={t("language.switcher")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="zh-CN">{t("language.zh-CN")}</SelectItem>
        <SelectItem value="en">{t("language.en")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
