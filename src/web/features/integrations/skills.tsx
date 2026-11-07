import {
  ArrowLeft,
  ChevronDown,
  Code2,
  Download,
  Eye,
  FileArchive,
  FileText,
  Folder as FolderIcon,
  HardDrive,
  Library,
  MoreHorizontal,
  Pencil,
  Plus,
  ScrollText,
  SquarePen,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LogoMark } from "@/components/logo";
import { LogoTile } from "@/components/logo-tile";
import { Markdown } from "@/components/markdown";
import { OutboundLink } from "@/components/outbound-link";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lang, t } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  type Found,
  findSkills,
  findSkillsInArchive,
  installSkills,
  listSkillFiles,
  loadSkills,
  readSkill,
  readSkillFileText,
  removeSkill,
  type SkillFileInfo,
  saveSkill,
  setSkillEnabled,
  skillZipUrl,
  useSkills,
} from "@/stores/skills";
import { PACKS, type PackId, readSkillFile, type Skill, validSkillName } from "../../../shared/skills";

const ts = t.skills;

export type SkillDialog = "github" | "zip" | "local" | "write" | { edit: string };

const GITHUB_LOGO = "/brands/github.png";
// Up to this many found skills start picked; a longer list also gets a search box.
const FEW = 3;
const LONG = 8;

export function AddSkillMenu({ onPick }: { onPick: (d: SkillDialog) => void }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          <Plus />
          {ts.add}
          <ChevronDown className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onSelect={() => onPick("github")}>
          <img src={GITHUB_LOGO} alt="" className="size-4 rounded-[4px]" />
          {ts.fromGithub}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onPick("zip")}>
          <FileArchive />
          {ts.fromZip}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onPick("local")}>
          <HardDrive />
          {ts.fromLocal}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onPick("write")}>
          <SquarePen />
          {ts.write}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Built-in skills cannot be turned off, so they state it instead of showing a switch; optional ones get the switch.
function SkillToggle({ skill }: { skill: Skill }) {
  if (skill.source.kind === "builtin" && !skill.optional)
    return (
      <span className="text-xs leading-5 text-muted-foreground" title={ts.builtinNote}>
        {ts.alwaysOn}
      </span>
    );
  return (
    <Switch
      checked={skill.enabled}
      aria-label={`${ts.enabled}: ${skill.name}`}
      onCheckedChange={(on) => void setSkillEnabled(skill.name, on).catch((e: Error) => toast.error(e.message))}
    />
  );
}

// Vendored built-ins wear their maker's logo.
const REPO_LOGO: Record<string, { src: string; icon: boolean }> = {
  "cloudflare/security-audit-skill": { src: "/brands/cloudflare.jpg", icon: true },
};

// A built-in skill wears Satgas's own mark; the others a quiet glyph.
function SkillTile({ skill, size }: { skill: Skill; size?: "sm" | "lg" }) {
  const builtin = skill.source.kind === "builtin";
  const glyph = size === "lg" ? "size-7" : "size-5";
  return (
    <LogoTile
      size={size}
      logo={skill.repo ? REPO_LOGO[skill.repo] : undefined}
      fallback={builtin ? <LogoMark className={glyph} /> : <ScrollText className={cn(glyph, "text-muted-foreground")} aria-hidden="true" />}
    />
  );
}

export function SkillsTab({
  query,
  onOpen,
  onShow,
  onShowPack,
}: {
  query: string;
  onOpen: (d: SkillDialog) => void;
  onShow: (name: string) => void;
  onShowPack: (pack: PackId) => void;
}) {
  const skills = useSkills((s) => s.skills);
  const error = useSkills((s) => s.error);
  const [removing, setRemoving] = useState<Skill | null>(null);

  useEffect(() => {
    void loadSkills();
  }, []);

  if (error && !skills)
    return (
      <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm">
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void loadSkills()}>
          {t.retry}
        </Button>
      </div>
    );
  if (!skills)
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-busy="true">
        {["a", "b"].map((k) => (
          <div key={k} className="flex gap-4 rounded-xl bg-muted/50 p-4">
            <Skeleton className="size-12 rounded-xl" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    );

  if (!skills.length)
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-14 text-center">
        <div className="flex max-w-md flex-col gap-1">
          <p className="text-sm font-medium">{ts.empty}</p>
          <p className="text-sm text-muted-foreground">{ts.emptyHint}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onOpen("github")}>
            <img src={GITHUB_LOGO} alt="" className="size-4 rounded-[4px]" />
            {ts.fromGithub}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onOpen("write")}>
            <SquarePen />
            {ts.write}
          </Button>
        </div>
      </div>
    );

  const needle = query.trim().toLowerCase();
  const matches = (s: Skill) => !needle || s.name.includes(needle) || s.description.toLowerCase().includes(needle);
  const loose = skills.filter((s) => !s.pack && matches(s));
  // A bundle shows as one entry that opens its own page; a search also surfaces its matching skills one by one.
  const packs = (Object.keys(PACKS) as PackId[])
    .map((id) => ({ id, all: skills.filter((s) => s.pack === id) }))
    .filter((p) => p.all.length && (!needle || p.id.includes(needle) || p.all.some(matches)));
  const inPacks = needle ? skills.filter((s) => s.pack && matches(s)) : [];
  const builtins = loose.filter((s) => s.source.kind === "builtin");
  const yours = loose.filter((s) => s.source.kind !== "builtin");
  const count = builtins.length + packs.length + inPacks.length + yours.length;
  const card = (s: Skill) => (
    <SkillCard key={s.name} skill={s} onShow={onShow} onEdit={() => onOpen({ edit: s.name })} onRemove={() => setRemoving(s)} />
  );

  return (
    <section aria-labelledby="skills-heading" className="flex flex-col gap-4">
      <h2 id="skills-heading" className="flex items-center gap-2 text-base font-medium">
        {ts.tab}
        <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">{count}</span>
      </h2>
      {count ? (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {builtins.map(card)}
          {packs.map((p) => (
            <PackCard key={p.id} id={p.id} total={p.all.length} onOpen={() => onShowPack(p.id)} />
          ))}
          {inPacks.map(card)}
          {yours.map(card)}
        </ul>
      ) : (
        <p className="rounded-xl bg-muted/50 px-6 py-10 text-center text-sm text-muted-foreground">{ts.noResults(query.trim())}</p>
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={ts.removeTitle(removing?.name ?? "")}
        desc={ts.removeText}
        confirmText={ts.remove}
        cancelBtnText={ts.cancel}
        destructive
        handleConfirm={async () => {
          if (!removing) return null;
          try {
            await removeSkill(removing.name);
            setRemoving(null);
            return null;
          } catch (e) {
            return (e as Error).message;
          }
        }}
      />
    </section>
  );
}

function SkillCard({
  skill: s,
  onShow,
  onEdit,
  onRemove,
}: {
  skill: Skill;
  onShow: (name: string) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="relative flex items-start gap-4 rounded-xl bg-muted/50 p-4 transition-colors hover:bg-muted/80">
      <SkillTile skill={s} />
      <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", !s.enabled && "opacity-60")}>
        <h3 className="truncate font-mono text-sm font-medium">
          <button
            type="button"
            onClick={() => onShow(s.name)}
            aria-label={ts.open(s.name)}
            className="text-start after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {s.name}
          </button>
        </h3>
        <p className="truncate text-sm text-muted-foreground" title={s.description}>
          {s.description}
        </p>
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-1">
        <SkillToggle skill={s} />
        <SkillMenu skill={s} onEdit={onEdit} onRemove={onRemove} />
      </div>
    </li>
  );
}

function PackSource({ id, total }: { id: PackId; total: number }) {
  const pack = PACKS[id];
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <img src={GITHUB_LOGO} alt="" className="size-3.5 shrink-0 rounded-[3px]" />
      <OutboundLink
        href={`https://github.com/${pack.repo}`}
        className="relative z-10 truncate rounded hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {pack.repo}
      </OutboundLink>
      <span aria-hidden="true">·</span>
      <span className="shrink-0 tabular-nums">{ts.packCount(total)}</span>
    </span>
  );
}

const packTile = (size?: "lg") => (
  <LogoTile size={size} fallback={<Library className={cn(size ? "size-7" : "size-5", "text-muted-foreground")} aria-hidden="true" />} />
);

// A built-in bundle is one entry in the list; its skills live on its own page.
function PackCard({ id, total, onOpen }: { id: PackId; total: number; onOpen: () => void }) {
  return (
    <li className="relative flex items-start gap-4 rounded-xl bg-muted/50 p-4 transition-colors hover:bg-muted/80">
      {packTile()}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <button
            type="button"
            onClick={onOpen}
            aria-label={ts.open(id)}
            className="truncate text-start font-mono after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {id}
          </button>
          <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">· {ts.packCount(total)}</span>
        </h3>
        <p className="truncate text-sm text-muted-foreground" title={ts.packDesc[id]}>
          {ts.packDesc[id]}
        </p>
      </div>
      <span className="shrink-0 text-xs leading-5 text-muted-foreground" title={ts.builtinNote}>
        {ts.alwaysOn}
      </span>
    </li>
  );
}

// A bundle's page: what it is and where it comes from, then each of its skills, which opens its own detail.
export function PackDetail({ id, onBack, onShow }: { id: PackId; onBack: () => void; onShow: (name: string) => void }) {
  const skills = useSkills((s) => s.skills);
  useEffect(() => {
    if (!useSkills.getState().skills) void loadSkills();
  }, []);
  const members = (skills ?? []).filter((s) => s.pack === id);
  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        aria-label={t.backTo(ts.tab)}
        className="-ms-2 inline-flex h-7 w-fit items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {ts.tab}
      </button>

      <header className="flex flex-wrap items-center gap-4">
        {packTile()}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="truncate font-mono text-lg font-medium">{id}</h1>
          <p className="flex min-w-0 text-sm text-muted-foreground">
            <PackSource id={id} total={members.length || 0} />
          </p>
        </div>
        <span className="shrink-0 px-1 text-xs text-muted-foreground" title={ts.builtinNote}>
          {ts.alwaysOn}
        </span>
      </header>

      <div className="flex max-w-3xl flex-col gap-3">
        <p className="text-[15px] leading-7">{ts.packDesc[id]}</p>
        <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{ts.builtinNote}</p>
      </div>

      {!skills ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-busy="true">
          {["a", "b", "c", "d"].map((k) => (
            <Skeleton key={k} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : (
        <section aria-labelledby="pack-skills" className="flex flex-col gap-3">
          <h2 id="pack-skills" className="flex items-center gap-2 text-base font-medium">
            {ts.tab}
            <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">{members.length}</span>
          </h2>
          <ul className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
            {members.map((s) => (
              <li key={s.name}>
                <button
                  type="button"
                  onClick={() => onShow(s.name)}
                  aria-label={ts.open(s.name)}
                  className="flex w-full min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  <span className="truncate font-mono text-[13px] font-medium">{s.name}</span>
                  <span className="line-clamp-2 text-xs leading-[18px] text-muted-foreground">{s.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// Edit for skills written here, Remove for anything not built in; a built-in skill only has its switch.
function SkillMenu({ skill, onEdit, onRemove }: { skill: Skill; onEdit: () => void; onRemove: () => void }) {
  if (skill.source.kind === "builtin") return null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`${t.moreActions}: ${skill.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {skill.source.kind === "own" && (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil />
            {ts.edit}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onClick={onRemove}>
          <Trash2 />
          {ts.remove}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Finds skills in a GitHub repo, an uploaded archive or this machine, then installs the ones picked.
export function AddSkillsDialog({ from, onClose }: { from: "github" | "zip" | "local"; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const id = useId();

  const look = async (job: () => Promise<Found>) => {
    setFinding(true);
    setProblem(null);
    try {
      const result = await job();
      setFound(result);
      setFilter("");
      // A link to a skill or two picks them; a long list starts empty so nothing is installed by accident.
      // One already installed always waits for a deliberate update.
      const fresh = result.found.filter((f) => !f.installed);
      setPicked(new Set(fresh.length <= FEW ? fresh.map((f) => f.name) : []));
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setFinding(false);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: the machine is searched once, when the dialog opens.
  useEffect(() => {
    if (from === "local") void look(() => findSkills({ local: true }));
  }, []);

  const install = async () => {
    if (!found || !picked.size) return;
    setInstalling(true);
    setProblem(null);
    try {
      await installSkills(found.stage, [...picked]);
      toast.success(ts.added(picked.size));
      onClose();
    } catch (e) {
      setProblem((e as Error).message);
      setInstalling(false);
    }
  };

  const needle = filter.trim().toLowerCase();
  const shown = (found?.found ?? []).filter((f) => !needle || f.name.includes(needle) || f.description.toLowerCase().includes(needle));
  const title = from === "github" ? ts.githubTitle : from === "zip" ? ts.zipTitle : ts.localTitle;
  const lead = from === "github" ? ts.githubLead : from === "zip" ? ts.zipLead : ts.localLead;
  const busy = finding || installing;

  return (
    <Dialog open onOpenChange={(open) => !open && !installing && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{lead}</DialogDescription>
        </DialogHeader>

        {from === "github" && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) void look(() => findSkills({ github: url.trim() }));
            }}
          >
            <label htmlFor={`${id}-url`} className="sr-only">
              {ts.githubTitle}
            </label>
            <Input
              id={`${id}-url`}
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={ts.githubPlaceholder}
              spellCheck={false}
              className="font-mono text-sm"
            />
            <Button type="submit" variant={found ? "outline" : "default"} disabled={!url.trim() || busy} className="shrink-0">
              {finding ? ts.finding : ts.find}
            </Button>
          </form>
        )}
        {from === "zip" && (
          <div className="flex items-center gap-3">
            <Button variant="outline" disabled={busy} onClick={() => picker.current?.click()}>
              <FileArchive />
              {finding ? ts.finding : ts.chooseZip}
            </Button>
            <input
              ref={picker}
              type="file"
              accept=".zip,.tar.gz,.tgz,application/zip,application/gzip"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void look(() => findSkillsInArchive(file));
              }}
            />
          </div>
        )}
        {from === "local" && finding && <p className="satgas-shimmer text-sm text-muted-foreground">{ts.finding}</p>}

        {problem && (
          <p role="alert" className="text-sm text-destructive">
            <RichText text={problem} />
          </p>
        )}

        {found && (
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="sr-only">{ts.pick(found.found.length)}</legend>
            <div className="flex items-center justify-between gap-3">
              <p aria-hidden="true" className="text-sm font-medium">
                {ts.pick(found.found.length)}
              </p>
              {found.found.length > 1 && (
                <button
                  type="button"
                  onClick={() => setPicked(picked.size ? new Set() : new Set(shown.map((f) => f.name)))}
                  className="rounded text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {picked.size ? ts.clear : ts.selectAll}
                </button>
              )}
            </div>
            {found.found.length > LONG && (
              <Input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={ts.search}
                aria-label={ts.search}
                className="h-8"
              />
            )}
            <ul className="-mx-1 flex max-h-80 flex-col overflow-y-auto">
              {shown.map((f) => (
                <li key={f.name}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-muted/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                    <input
                      type="checkbox"
                      checked={picked.has(f.name)}
                      onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(f.name);
                        else next.delete(f.name);
                        setPicked(next);
                      }}
                      className="mt-0.5 size-4 shrink-0 accent-signal"
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-mono text-sm">{f.name}</span>
                        {f.installed && <span className="shrink-0 text-xs text-muted-foreground">{ts.installedBadge}</span>}
                      </span>
                      {f.description && <span className="line-clamp-2 text-xs text-muted-foreground">{f.description}</span>}
                      <span className="truncate font-mono text-[11px] text-muted-foreground/80">
                        {f.path || "/"} · {ts.files(f.files)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={installing}>
            {ts.cancel}
          </Button>
          <Button onClick={() => void install()} disabled={!found || !picked.size || busy}>
            {installing ? ts.installing : ts.install(picked.size)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Writes a skill, or edits one written here; the SKILL.md is made from the three fields.
export function SkillEditor({ name: editing, onClose }: { name?: string; onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(!!editing);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    if (!editing) return;
    readSkill(editing)
      .then((s) => {
        setName(s.name);
        setDescription(s.description);
        setBody(s.body);
      })
      .catch((e: Error) => setProblem(e.message))
      .finally(() => setLoading(false));
  }, [editing]);

  const nameOk = !name || validSkillName(name);
  const submit = async () => {
    if (!validSkillName(name)) return setProblem(ts.nameHint);
    setSaving(true);
    setProblem(null);
    try {
      await saveSkill({ name, description, body }, editing);
      toast.success(ts.saved);
      onClose();
    } catch (e) {
      setProblem((e as Error).message);
      setSaving(false);
    }
  };

  const field = "flex flex-col gap-1.5";
  const hint = "text-xs text-muted-foreground";
  const area =
    "w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? ts.editTitle : ts.writeTitle}</DialogTitle>
          <DialogDescription>{ts.lead}</DialogDescription>
        </DialogHeader>
        <form
          id={`${id}-form`}
          className="flex flex-col gap-4"
          aria-busy={loading}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className={field}>
            <label htmlFor={`${id}-name`} className="text-sm font-medium">
              {ts.name}
            </label>
            <Input
              id={`${id}-name`}
              autoFocus={!editing}
              value={name}
              disabled={loading}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
              placeholder="brand-voice"
              spellCheck={false}
              aria-invalid={!nameOk}
              aria-describedby={`${id}-name-hint`}
              className="font-mono"
            />
            <p id={`${id}-name-hint`} className={cn(hint, !nameOk && "text-destructive")}>
              {ts.nameHint}
            </p>
          </div>
          <div className={field}>
            <label htmlFor={`${id}-desc`} className="text-sm font-medium">
              {ts.description}
            </label>
            <textarea
              id={`${id}-desc`}
              rows={2}
              value={description}
              disabled={loading}
              onChange={(e) => setDescription(e.target.value)}
              aria-describedby={`${id}-desc-hint`}
              className={area}
            />
            <p id={`${id}-desc-hint`} className={hint}>
              {ts.descriptionHint}
            </p>
          </div>
          <div className={field}>
            <label htmlFor={`${id}-body`} className="text-sm font-medium">
              {ts.instructions}
            </label>
            <textarea
              id={`${id}-body`}
              rows={12}
              value={body}
              disabled={loading}
              onChange={(e) => setBody(e.target.value)}
              aria-describedby={`${id}-body-hint`}
              className={cn(area, "min-h-48 font-mono text-[13px] leading-5")}
            />
            <p id={`${id}-body-hint`} className={hint}>
              {ts.instructionsHint}
            </p>
          </div>
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              <RichText text={problem} />
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {ts.cancel}
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={saving || loading || !name || !description.trim() || !body.trim()}>
            {saving ? ts.saving : ts.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TreeNode {
  name: string;
  path: string;
  children?: TreeNode[];
}

// Paths into a tree: folders first, then files, each by name; SKILL.md leads its folder.
function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const path of paths) {
    let level = root;
    const parts = path.split("/");
    parts.forEach((part, i) => {
      const at = parts.slice(0, i + 1).join("/");
      let node = level.find((n) => n.name === part);
      if (!node) {
        node = i === parts.length - 1 ? { name: part, path: at } : { name: part, path: at, children: [] };
        level.push(node);
      }
      level = node.children ?? [];
    });
  }
  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .map((n) => (n.children ? { ...n, children: sort(n.children) } : n))
      .sort(
        (a, b) =>
          Number(!!b.children) - Number(!!a.children) ||
          Number(b.name === "SKILL.md") - Number(a.name === "SKILL.md") ||
          a.name.localeCompare(b.name),
      );
  return sort(root);
}

function Tree({
  nodes,
  current,
  onPick,
  depth = 0,
}: {
  nodes: TreeNode[];
  current: string;
  onPick: (path: string) => void;
  depth?: number;
}) {
  return (
    <ul className="flex flex-col">
      {nodes.map((n) => (
        <li key={n.path}>
          {n.children ? (
            <Folder node={n} current={current} onPick={onPick} depth={depth} />
          ) : (
            <FileRow node={n} current={current} onPick={onPick} depth={depth} />
          )}
        </li>
      ))}
    </ul>
  );
}

const indent = (depth: number) => ({ paddingInlineStart: `${8 + depth * 14}px` });

function Folder({ node, current, onPick, depth }: { node: TreeNode; current: string; onPick: (path: string) => void; depth: number }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={indent(depth)}
        className="flex h-8 w-full items-center gap-2 rounded-md pe-2 text-start text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        <ChevronDown
          className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")}
          aria-hidden="true"
        />
      </button>
      {open && node.children && <Tree nodes={node.children} current={current} onPick={onPick} depth={depth + 1} />}
    </>
  );
}

function FileRow({ node, current, onPick, depth }: { node: TreeNode; current: string; onPick: (path: string) => void; depth: number }) {
  const active = node.path === current;
  return (
    <button
      type="button"
      aria-current={active ? "true" : undefined}
      onClick={() => onPick(node.path)}
      style={indent(depth)}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md pe-2 text-start text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active && "bg-muted text-foreground",
      )}
    >
      <FileText className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{node.name}</span>
    </button>
  );
}

const day = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" });

type Shown = { path: string; size: number; text?: string } | "error" | null;

// One skill's page: what it does and its files, the way a plugin listing shows them.
export function SkillDetail({ name, onBack, onOpen }: { name: string; onBack: () => void; onOpen: (d: SkillDialog) => void }) {
  const skills = useSkills((s) => s.skills);
  const [tab, setTab] = useState<"overview" | "contents">("overview");
  const [files, setFiles] = useState<SkillFileInfo[] | null>(null);
  const [current, setCurrent] = useState("SKILL.md");
  const [shown, setShown] = useState<Shown>(null);
  const [main, setMain] = useState<string | null>(null);
  const [view, setView] = useState<"preview" | "source">("preview");
  const [removing, setRemoving] = useState(false);
  const skill = skills?.find((s) => s.name === name);

  useEffect(() => {
    if (!useSkills.getState().skills) void loadSkills();
    listSkillFiles(name)
      .then(setFiles)
      .catch(() => setFiles([]));
    readSkillFileText(name, "SKILL.md")
      .then((f) => setMain(f.text ?? ""))
      .catch(() => setMain(""));
  }, [name]);

  useEffect(() => {
    setShown(null);
    readSkillFileText(name, current)
      .then(setShown)
      .catch(() => setShown("error"));
  }, [name, current]);

  if (skills && !skill)
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">{ts.missing}</p>
        <Button variant="outline" size="sm" onClick={onBack}>
          {ts.tab}
        </Button>
      </div>
    );

  const builtin = skill?.source.kind === "builtin";
  const meta = readSkillFile(main ?? "");
  const isMd = /\.md$/i.test(current);

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        aria-label={t.backTo(ts.tab)}
        className="-ms-2 inline-flex h-7 w-fit items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {ts.tab}
      </button>

      <header className="flex flex-wrap items-center gap-4">
        {skill ? <SkillTile skill={skill} /> : <Skeleton className="size-12 rounded-xl" />}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="truncate font-mono text-lg font-medium">{name}</h1>
          {skill ? (
            <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
              <span>{sourceText(skill)}</span>
              <span aria-hidden="true">·</span>
              <span>{ts.files(skill.files)}</span>
              {skill.installedAt > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{ts.updated(day.format(skill.installedAt))}</span>
                </>
              )}
            </p>
          ) : (
            <Skeleton className="h-4 w-48" />
          )}
        </div>
        {skill && (
          <div className="flex shrink-0 items-center gap-2">
            <SkillToggle skill={skill} />
            <SkillMenu skill={skill} onEdit={() => onOpen({ edit: name })} onRemove={() => setRemoving(true)} />
          </div>
        )}
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v === "contents" ? "contents" : "overview")} className="gap-6">
        <div className="flex items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="overview">{ts.overview}</TabsTrigger>
            <TabsTrigger value="contents">
              {ts.contents}
              {files && <span className="font-mono text-xs text-muted-foreground tabular-nums">{files.length}</span>}
            </TabsTrigger>
          </TabsList>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <a href={skillZipUrl(name)} download={`${name}.zip`}>
              <Download />
              {ts.download}
            </a>
          </Button>
        </div>

        <TabsContent value="overview" className="flex max-w-3xl flex-col gap-6">
          {builtin && (
            <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              {skill?.optional ? ts.optionalNote : ts.builtinNote}
            </p>
          )}
          {main === null ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : (
            <>
              {meta.description && <p className="text-[15px] leading-7">{meta.description}</p>}
              <Markdown text={meta.body} className="text-foreground" />
            </>
          )}
        </TabsContent>

        <TabsContent value="contents">
          <div className="grid overflow-hidden rounded-xl border md:grid-cols-[15rem_minmax(0,1fr)]">
            <nav aria-label={ts.contents} className="max-h-[36rem] overflow-y-auto border-b p-2 md:border-e md:border-b-0">
              {files ? (
                <Tree nodes={buildTree(files.map((f) => f.path))} current={current} onPick={setCurrent} />
              ) : (
                <div className="flex flex-col gap-2 p-2" aria-busy="true">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              )}
            </nav>
            <section aria-label={current} className="flex min-w-0 flex-col">
              <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b ps-4 pe-2">
                <span className="truncate font-mono text-xs text-muted-foreground">/{current}</span>
                {isMd && typeof shown === "object" && shown?.text !== undefined && (
                  <div className="flex items-center gap-0.5">
                    {(["preview", "source"] as const).map((v) => (
                      <Button
                        key={v}
                        variant="ghost"
                        size="icon-sm"
                        aria-label={v === "preview" ? ts.preview : ts.source}
                        title={v === "preview" ? ts.preview : ts.source}
                        aria-pressed={view === v}
                        onClick={() => setView(v)}
                        className={cn("text-muted-foreground hover:text-foreground", view === v && "bg-muted text-foreground")}
                      >
                        {v === "preview" ? <Eye /> : <Code2 />}
                      </Button>
                    ))}
                  </div>
                )}
              </header>
              <div className="max-h-[33rem] min-h-72 overflow-auto p-5">
                <FileBody shown={shown} markdown={isMd && view === "preview"} />
              </div>
            </section>
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={ts.removeTitle(name)}
        desc={ts.removeText}
        confirmText={ts.remove}
        cancelBtnText={ts.cancel}
        destructive
        handleConfirm={async () => {
          try {
            await removeSkill(name);
            setRemoving(false);
            onBack();
            return null;
          } catch (e) {
            return (e as Error).message;
          }
        }}
      />
    </div>
  );
}

function sourceText(skill: Skill): string {
  const s = skill.source;
  if (s.kind === "builtin") return ts.builtin;
  if (s.kind === "github") return s.repo;
  if (s.kind === "own") return ts.own;
  return s.kind === "import" ? ts.imported(s.from) : ts.uploaded(s.file);
}

// A Markdown file reads rendered, its front matter as a quiet list above; everything else as plain text.
function FileBody({ shown, markdown }: { shown: Shown; markdown: boolean }) {
  if (shown === null)
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  if (shown === "error") return <p className="text-sm text-destructive">{ts.fileFailed}</p>;
  if (shown.text === undefined)
    return <p className="text-sm text-muted-foreground">{shown.size > 512 * 1024 ? ts.tooLarge : ts.notText}</p>;
  if (!markdown) return <pre className="font-mono text-xs leading-5 whitespace-pre-wrap [overflow-wrap:anywhere]">{shown.text}</pre>;
  const meta = readSkillFile(shown.text);
  return (
    <div className="flex flex-col gap-4">
      {(meta.name || meta.description) && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-lg bg-muted/50 px-3 py-2.5 text-xs">
          {meta.name && (
            <>
              <dt className="text-muted-foreground">name</dt>
              <dd className="font-mono">{meta.name}</dd>
            </>
          )}
          {meta.description && (
            <>
              <dt className="text-muted-foreground">description</dt>
              <dd className="leading-5">{meta.description}</dd>
            </>
          )}
        </dl>
      )}
      <Markdown text={meta.body} className="text-foreground" />
    </div>
  );
}
