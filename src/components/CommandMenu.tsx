import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronRight, Laptop, Moon, Sun } from "lucide-react";
import { useSearch } from "@/context/search-provider";
import { useTheme } from "@/components/ThemeProvider";
import { useAuthStore } from "@/state/auth";
import { useI18n } from "@/i18n";
import { fetchSiteConfig } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { buildNavSections } from "@/lib/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@/components/ui/command";

export function CommandMenu() {
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const { open, setOpen } = useSearch();
  const user = useAuthStore((state) => state.user);
  const isAdmin = Boolean(user?.isAdmin || user?.isSuperAdmin);
  const { t } = useI18n();

  const { data: siteConfig } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig,
    staleTime: 5 * 60 * 1000
  });

  const sections = useMemo(
    () => buildNavSections({ t, isAdmin, siteConfig }),
    [t, isAdmin, siteConfig]
  );

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      className="max-w-2xl"
      title="Command Menu"
      description="Search for page commands"
    >
      <CommandInput placeholder={t("search.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("search.empty")}</CommandEmpty>
        {sections.map((section) => (
          <CommandGroup key={section.title ?? "default"} heading={section.title}>
            {section.items.map((item) => {
              if (item.url) {
                return (
                  <CommandItem
                    key={item.url}
                    value={`${item.title} ${item.url}`}
                    onSelect={() => runCommand(() => navigate(item.url!))}
                  >
                    <div className="flex size-4 items-center justify-center">
                      <ArrowRight className="size-2 text-muted-foreground/80" />
                    </div>
                    {item.title}
                  </CommandItem>
                );
              }

              return item.items?.map((sub) => (
                <CommandItem
                  key={`${item.title}-${sub.url}`}
                  value={`${item.title} ${sub.title} ${sub.url}`}
                  onSelect={() => runCommand(() => navigate(sub.url!))}
                >
                  <div className="flex size-4 items-center justify-center">
                    <ArrowRight className="size-2 text-muted-foreground/80" />
                  </div>
                  {item.title} <ChevronRight /> {sub.title}
                </CommandItem>
              ));
            })}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading={t("search.themeGroup")}>
          <CommandItem onSelect={() => runCommand(() => setTheme("light"))}>
            <Sun />
            <span>{t("theme.light")}</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setTheme("dark"))}>
            <Moon className="scale-90" />
            <span>{t("theme.dark")}</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setTheme("system"))}>
            <Laptop />
            <span>{t("theme.system")}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}