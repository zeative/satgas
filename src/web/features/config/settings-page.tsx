import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { RichText } from "@/components/rich-text";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Theme, useTheme } from "@/context/theme-provider";
import { LANGS, lang, setLang, t } from "@/i18n";
import { useRuns } from "@/stores/runs";
import { loadSettings, useSettings } from "@/stores/settings";
import { COMMIT_MODES, type CommitMode } from "../../../shared/commits";
import { CONCURRENCY, TASK_MINUTES } from "../../../shared/settings";
import { update } from "../integrations/update";
import { ConfigPage, LoadFailed, Row, SavedInput, Section } from "./parts";
import { SecurityView } from "./security-page";

const ti = t.integrations;
const tc = t.config;

export function SettingsPage() {
  const settings = useSettings((s) => s.settings);
  const failed = useSettings((s) => s.error);
  const { theme, setTheme } = useTheme();
  const fromEnv = useRuns((s) => s.config.concurrencyFromEnv);
  const search = useSearch({ from: "/_app/config/settings" });
  const navigate = useNavigate({ from: "/config/settings" });
  const tab = search.tab === "security" ? "security" : "general";
  useEffect(() => {
    void loadSettings();
  }, []);
  const themes: [Theme, string][] = [
    ["light", t.light],
    ["dark", t.dark],
    ["system", t.system],
  ];

  return (
    <ConfigPage
      title={tc.settings}
      actions={
        <Tabs value={tab} onValueChange={(v) => void navigate({ search: v === "security" ? { tab: "security" } : {}, replace: true })}>
          <TabsList>
            <TabsTrigger value="general">{tc.general}</TabsTrigger>
            <TabsTrigger value="security">{tc.security}</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {tab === "security" ? (
        <SecurityView />
      ) : (
        <>
          <Section title={tc.appearance}>
            <Row label={t.theme} hint={tc.themeHint} htmlFor="theme">
              <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                <SelectTrigger id="theme" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {themes.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Row label={t.language} hint={tc.languageHint} htmlFor="language">
              <Select value={lang} onValueChange={(v) => setLang(v as typeof lang)}>
                <SelectTrigger id="language" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {LANGS.map(([value, label]) => (
                    <SelectItem key={value} value={value} lang={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          </Section>

          {failed && !settings && <LoadFailed onRetry={() => void loadSettings()} />}
          {!settings && !failed && <Skeleton className="h-64 rounded-xl" />}
          {settings && (
            <>
              <Section title={tc.running}>
                <Row label={ti.taskMinutes} hint={ti.taskMinutesHint} htmlFor="task-minutes">
                  <Select value={String(settings.taskMinutes)} onValueChange={(v) => void update({ ...settings, taskMinutes: Number(v) })}>
                    <SelectTrigger id="task-minutes" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {TASK_MINUTES.map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {m ? ti.minutes(m) : ti.noLimit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>
                <Row
                  label={tc.concurrency}
                  htmlFor="concurrency"
                  hint={fromEnv ? <RichText text={tc.concurrencyEnv} /> : tc.concurrencyHint}
                >
                  <Select
                    value={String(settings.concurrency)}
                    disabled={!!fromEnv}
                    onValueChange={(v) => void update({ ...settings, concurrency: Number(v) })}
                  >
                    <SelectTrigger id="concurrency" className="w-32 tabular-nums">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {CONCURRENCY.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>
                <Row label={ti.teamTalk} hint={ti.teamTalkHint} htmlFor="team-talk">
                  <Switch
                    id="team-talk"
                    checked={settings.teamTalk}
                    onCheckedChange={(teamTalk) => void update({ ...settings, teamTalk })}
                  />
                </Row>
              </Section>

              <Section title={tc.git}>
                <Row label={ti.worktrees} hint={ti.worktreesHint} htmlFor="worktrees">
                  <Switch
                    id="worktrees"
                    checked={settings.worktrees}
                    onCheckedChange={(worktrees) => void update({ ...settings, worktrees })}
                  />
                </Row>
                <div className="flex flex-col gap-3 rounded-xl bg-muted/50 px-4 py-3">
                  <div className="flex items-center gap-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <label htmlFor="commit-style" className="text-sm font-medium">
                        {ti.commitStyle}
                      </label>
                      <p className="text-xs text-muted-foreground">{ti.commitStyleHint}</p>
                    </div>
                    <Select
                      value={settings.commitStyle.mode}
                      onValueChange={(mode) =>
                        void update({ ...settings, commitStyle: { ...settings.commitStyle, mode: mode as CommitMode } })
                      }
                    >
                      <SelectTrigger id="commit-style" className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end">
                        {COMMIT_MODES.map((m) => (
                          <SelectItem key={m} value={m}>
                            {ti.commitModes[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {settings.commitStyle.mode === "custom" && (
                    <div className="flex flex-col gap-1.5 border-t pt-3">
                      <label htmlFor="commit-rules" className="text-xs font-medium">
                        {ti.commitInstructions}
                      </label>
                      <SavedInput
                        id="commit-rules"
                        value={settings.commitStyle.instructions}
                        placeholder={ti.commitInstructionsPlaceholder}
                        onSave={(instructions) => void update({ ...settings, commitStyle: { ...settings.commitStyle, instructions } })}
                      />
                    </div>
                  )}
                </div>
                <Row label={ti.watchPulls} hint={ti.watchPullsHint} htmlFor="watch-pulls">
                  <Switch
                    id="watch-pulls"
                    checked={settings.watchPulls}
                    onCheckedChange={(watchPulls) => void update({ ...settings, watchPulls })}
                  />
                </Row>
              </Section>
            </>
          )}
        </>
      )}
    </ConfigPage>
  );
}
