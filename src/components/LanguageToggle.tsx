import { Languages } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useI18n, type Locale } from "@/i18n";

type LanguageToggleProps = {
  iconOnly?: boolean;
};

export function LanguageToggle({ iconOnly = false }: LanguageToggleProps) {
  const { locale, setLocale, t } = useI18n();

  return (
    <Select value={locale} onValueChange={(value) => setLocale(value as Locale)}>
      <SelectTrigger
        className={iconOnly ? "h-9 w-9 justify-center px-0 border-0 shadow-none" : "h-9 w-[140px] gap-2 px-3"}
        aria-label={t("language.switcher")}
      >
        <Languages className="h-4 w-4" />
        {!iconOnly ? <SelectValue placeholder={t("language.switcher")} /> : null}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="zh-CN">{t("language.zh-CN")}</SelectItem>
        <SelectItem value="en">{t("language.en")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
