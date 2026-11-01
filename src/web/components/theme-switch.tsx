import { Check, Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { type Theme, useTheme } from "@/context/theme-provider";
import { t } from "@/i18n";

export function ThemeSwitch({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    document.querySelector("meta[name='theme-color']")?.setAttribute("content", resolvedTheme === "dark" ? "#141414" : "#ffffff");
  }, [resolvedTheme]);

  const options: [Theme, string][] = [
    ["light", t.light],
    ["dark", t.dark],
    ["system", t.system],
  ];

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className} aria-label={t.theme} title={t.theme}>
          {resolvedTheme === "dark" ? <Moon /> : <Sun />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        {options.map(([value, label]) => (
          <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
            {label}
            {theme === value && <Check className="ms-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
