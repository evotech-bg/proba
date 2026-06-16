import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const KEY = "proba-theme";

export function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem(KEY)) as "dark" | "light" | null;
    const initial = stored ?? "dark";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem(KEY, next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };
  return { theme, toggle };
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggle } = useTheme();
  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <Button
      variant="ghost"
      size={compact ? "icon" : "sm"}
      onClick={toggle}
      aria-label="Toggle theme"
      className="text-muted-foreground hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
      {!compact && <span className="ml-2 text-xs">{theme === "dark" ? "Light" : "Dark"}</span>}
    </Button>
  );
}
