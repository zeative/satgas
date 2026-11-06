import { useNavigate } from "@tanstack/react-router";
import { Check, Copy, Languages, Laptop, LogOut, Moon, Plus, RotateCcw, SlidersHorizontal, Square, Sun } from "lucide-react";
import { useCallback } from "react";
import { StatusIcon } from "@/components/status";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSearch } from "@/context/search-provider";
import { useTheme } from "@/context/theme-provider";
import { LANGS, lang, setLang, t } from "@/i18n";
import { cancelMission, canStop, copyReport, finalReport, openMission, runAgain } from "@/lib/actions";
import { signOut } from "@/stores/auth";
import { useRuns } from "@/stores/runs";

const MAX_MISSIONS = 30;

export function CommandMenu() {
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const { open, setOpen } = useSearch();
  const runs = useRuns((s) => s.runs);
  const run = useRuns((s) => s.run);

  const runCommand = useCallback(
    (command: () => unknown) => {
      setOpen(false);
      command();
    },
    [setOpen],
  );

  return (
    <CommandDialog modal open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t.searchPlaceholder} />
      <CommandList>
        <ScrollArea type="hover" className="h-80 pe-1">
          <CommandEmpty>{t.paletteEmpty}</CommandEmpty>

          <CommandGroup heading={t.navigation}>
            <CommandItem onSelect={() => runCommand(() => navigate({ to: "/" }))}>
              <Plus />
              {t.newMission}
            </CommandItem>
            <CommandItem
              value={`${t.config.title} ${t.config.settings}`}
              onSelect={() => runCommand(() => navigate({ to: "/config/settings" }))}
            >
              <SlidersHorizontal />
              {t.config.settings}
            </CommandItem>
            <CommandItem
              value={`${t.config.title} ${t.config.security}`}
              onSelect={() => runCommand(() => navigate({ to: "/config/settings", search: { tab: "security" } }))}
            >
              <SlidersHorizontal />
              {t.config.security}
            </CommandItem>
            <CommandItem value={`${t.config.title} ${t.config.usage}`} onSelect={() => runCommand(() => navigate({ to: "/config/usage" }))}>
              <SlidersHorizontal />
              {t.config.usage}
            </CommandItem>
            <CommandItem
              value={`${t.config.title} ${t.config.storage}`}
              onSelect={() => runCommand(() => navigate({ to: "/config/usage", search: { view: "storage" } }))}
            >
              <SlidersHorizontal />
              {t.config.storage}
            </CommandItem>
            <CommandItem value={`${t.config.title} ${t.config.about}`} onSelect={() => runCommand(() => navigate({ to: "/config/about" }))}>
              <SlidersHorizontal />
              {t.config.about}
            </CommandItem>
          </CommandGroup>

          {run && (
            <CommandGroup heading={run.title ?? t.mission}>
              {canStop(run) ? (
                <CommandItem onSelect={() => runCommand(() => cancelMission(run))}>
                  <Square />
                  {t.cancelMission}
                </CommandItem>
              ) : (
                <CommandItem onSelect={() => runCommand(() => runAgain(run))}>
                  <RotateCcw />
                  {t.runAgain}
                </CommandItem>
              )}
              {finalReport(run) && (
                <CommandItem onSelect={() => runCommand(() => copyReport(run))}>
                  <Copy />
                  {t.copyReport}
                </CommandItem>
              )}
            </CommandGroup>
          )}

          {!!runs?.length && (
            <CommandGroup heading={t.paletteMissions}>
              {runs.slice(0, MAX_MISSIONS).map((r) => (
                <CommandItem key={r.id} value={`${r.title ?? ""} ${r.prompt} ${r.id}`} onSelect={() => runCommand(() => openMission(r.id))}>
                  <StatusIcon status={r.status} />
                  <span className="truncate">{r.title ?? r.prompt}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandSeparator />
          <CommandGroup heading={t.theme}>
            <CommandItem onSelect={() => runCommand(() => setTheme("light"))}>
              <Sun />
              <span>{t.light}</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setTheme("dark"))}>
              <Moon className="scale-90" />
              <span>{t.dark}</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setTheme("system"))}>
              <Laptop />
              <span>{t.system}</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading={t.language}>
            {LANGS.map(([value, label]) => (
              <CommandItem key={value} value={`${t.language} ${label}`} onSelect={() => runCommand(() => setLang(value))}>
                <Languages />
                <span lang={value}>{label}</span>
                {lang === value && <Check className="ms-auto" />}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup>
            <CommandItem onSelect={() => runCommand(() => void signOut())}>
              <LogOut />
              <span>{t.auth.signOut}</span>
            </CommandItem>
          </CommandGroup>
        </ScrollArea>
      </CommandList>
    </CommandDialog>
  );
}
