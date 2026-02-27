import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import { useAuthStore } from "@/state/auth";
import { updateAccountProfile } from "@/lib/api";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const user = useAuthStore((state) => state.user);
  
  const toggle = async () => {
    const newTheme = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    
    // 同时更新用户的主题偏好到服务器
    if (user) {
      try {
        await updateAccountProfile({
          name: user.name,
          url: "",
          theme: newTheme
        });
        // 刷新用户信息以同步主题偏好
        await useAuthStore.getState().refreshUser();
      } catch (error) {
        console.error('[ThemeToggle] Failed to update theme preference:', error);
      }
    }
  };

  return (
    <Button
      variant="outline"
      size="icon"
      className="relative h-9 w-9"
      onClick={toggle}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">切换主题</span>
    </Button>
  );
}
