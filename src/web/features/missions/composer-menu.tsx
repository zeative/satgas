import { Link } from "@tanstack/react-router";
import { Blocks, Bot, Paperclip, Plus, ScrollText, Server, Settings2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ClaudeMark, CodexMark } from "@/components/brand-marks";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { t } from "@/i18n";
import { loadSettings, saveSettings, useSettings } from "@/stores/settings";
import { loadSkills, useSkills } from "@/stores/skills";
import type { Settings } from "../../../shared/settings";

// The composer's + menu, shared by Home and the board: files, skills, agent switches and connectors.
export function ComposerMenu({ onSkill, onAddFiles }: { onSkill?: (name: string) => void; onAddFiles?: () => void }) {
  const settings = useSettings((s) => s.settings);
  const loadError = useSettings((s) => s.error);
  const [retrying, setRetrying] = useState(false);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
          aria-label={t.composerMenu}
          title={t.composerMenu}
        >
          <Plus />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {onAddFiles && (
          <DropdownMenuItem onClick={onAddFiles}>
            <Paperclip />
            {t.attach.add}
          </DropdownMenuItem>
        )}
        {onSkill && <SkillsSub onPick={onSkill} />}
        {!settings && (
          // Agents and connectors come from the settings; while they load or after they fail, the menu says so.
          <DropdownMenuItem
            disabled={!loadError || retrying}
            onSelect={(e) => {
              e.preventDefault();
              setRetrying(true);
              void loadSettings().finally(() => setRetrying(false));
            }}
          >
            {loadError && <TriangleAlert className="text-destructive" />}
            <span className="min-w-0 flex-1 truncate">{loadError ? t.composerMenuFailed : t.composerMenuLoading}</span>
            {loadError && <span className="text-xs text-muted-foreground">{retrying ? t.picker.retrying : t.retry}</span>}
          </DropdownMenuItem>
        )}
        {settings && (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Bot />
                {t.integrations.agents}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-64">
                {AGENTS.map(({ kind, Mark }) => (
                  <Toggle
                    key={kind}
                    icon={<Mark className="size-4" />}
                    label={t.agent[kind]}
                    on={settings.agents[kind].tasks}
                    onToggle={(tasks) =>
                      void persist({ ...settings, agents: { ...settings.agents, [kind]: { ...settings.agents[kind], tasks } } })
                    }
                  />
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/integrations" search={{ tab: "agents" }}>
                    <Settings2 />
                    {t.manageAgents}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Blocks />
                {t.integrations.servers}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-64">
                <DropdownMenuItem asChild>
                  <Link to="/integrations">
                    <Plus />
                    {t.integrations.addServer}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/integrations" search={{ view: "yours" }}>
                    <Settings2 />
                    {t.manageConnectors}
                  </Link>
                </DropdownMenuItem>
                {settings.mcpServers.length > 0 && <DropdownMenuSeparator />}
                {settings.mcpServers.map((server) => (
                  <Toggle
                    key={server.id}
                    icon={<Server className="size-4 text-muted-foreground" />}
                    label={server.name}
                    on={server.enabled}
                    onToggle={(enabled) =>
                      void persist({
                        ...settings,
                        mcpServers: settings.mcpServers.map((x) => (x.id === server.id ? { ...x, enabled } : x)),
                      })
                    }
                  />
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const AGENTS = [
  { kind: "claude", Mark: ClaudeMark },
  { kind: "codex", Mark: CodexMark },
] as const;

async function persist(next: Settings) {
  const problem = await saveSettings(next);
  if (problem) toast.error(problem);
}

// A menu row with a switch; choosing it flips the switch and keeps the menu open.
function Toggle({ icon, label, on, onToggle }: { icon: React.ReactNode; label: string; on: boolean; onToggle: (on: boolean) => void }) {
  return (
    <DropdownMenuItem
      role="menuitemcheckbox"
      aria-checked={on}
      onSelect={(e) => {
        e.preventDefault();
        onToggle(!on);
      }}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Switch checked={on} tabIndex={-1} aria-hidden="true" className="pointer-events-none" />
    </DropdownMenuItem>
  );
}

// The skills a message can name: agent-skills and the person's own; picking one puts /name in the message.
function SkillsSub({ onPick }: { onPick: (name: string) => void }) {
  const skills = useSkills((s) => s.skills);
  useEffect(() => {
    if (!useSkills.getState().skills) void loadSkills();
  }, []);
  const usable = (skills ?? []).filter((s) => s.enabled && (s.source.kind !== "builtin" || s.pack));
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <ScrollText />
        {t.skills.tab}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-80 w-80 overflow-y-auto">
        {!skills ? (
          <DropdownMenuItem disabled>{t.composerMenuLoading}</DropdownMenuItem>
        ) : (
          usable.map((s) => (
            <DropdownMenuItem key={s.name} onClick={() => onPick(s.name)} className="flex-col items-start gap-0.5">
              <span className="font-mono text-[13px]">/{s.name}</span>
              <span className="line-clamp-1 text-xs text-muted-foreground">{s.description}</span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/integrations" search={{ tab: "skills" }}>
            <Settings2 />
            {t.skills.manage}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
