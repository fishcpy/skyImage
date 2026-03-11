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

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const user = useAuthStore((state) => state.user);
  const currentValue = theme ?? "system";

  const handleThemeChange = async (value: "light" | "dark" | "system") => {
    setTheme(value);

    if (user) {
      try {
        await updateAccountProfile({
          name: user.name,
          url: "",
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
      <SelectTrigger className="h-9 w-[140px] gap-2 px-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <SelectValue placeholder="主题" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="system">跟随系统</SelectItem>
        <SelectItem value="light">浅色</SelectItem>
        <SelectItem value="dark">深色</SelectItem>
      </SelectContent>
    </Select>
  );
}
