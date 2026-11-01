import { useNavigate } from "@tanstack/react-router";
import { Copy, Laptop, LogOut, Moon, Plus, RotateCcw, Square, Sun } from "lucide-react";
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
import { t } from "@/i18n";
import { cancelMission, copyReport, finalReport, isLiveRun, openMission, runAgain } from "@/lib/actions";
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
          </CommandGroup>

          {run && (
            <CommandGroup heading={run.title ?? t.mission}>
              {isLiveRun(run) ? (
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
