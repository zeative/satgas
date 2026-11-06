import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { request } from "@/stores/runs";
import type { StorageBoard, StorageReport } from "../../../shared/housekeeping";
import { fmtBytes, LoadFailed, Section, ShareBar, useJson } from "./parts";

const tc = t.config;
type Target = StorageBoard | "all";
const clean = (board: string) => request("POST", "/api/storage/clean", { board });
const KINDS_SHOWN = 4;
const BOARDS_SHOWN = 10;

// The biggest kinds by name, and the small remainder as one, so tiny folders do not crowd the legend.
function kindParts(kinds: StorageReport["kinds"]) {
  const named = kinds.filter((k) => k.kind !== "other" && k.bytes > 0);
  const shown = named.slice(0, KINDS_SHOWN);
  const rest = [...named.slice(KINDS_SHOWN), ...kinds.filter((k) => k.kind === "other")].reduce((n, k) => n + k.bytes, 0);
  return [
    ...shown.map((k) => ({ label: tc.kinds[k.kind] ?? k.kind, value: k.bytes })),
    ...(rest ? [{ label: tc.kinds.other as string, value: rest }] : []),
  ];
}

export function StorageView({ refreshTick }: { refreshTick: number }) {
  const { data, failed, load } = useJson<StorageReport>("/api/storage");
  const [target, setTarget] = useState<Target | null>(null);
  const [all, setAll] = useState(false);
  const refresh = () => load("/api/storage?refresh=1");
  const boards = data?.boards ?? [];
  const ready = boards.filter((b) => b.cleanable > 0 && !b.live);
  const canClean = ready.reduce((n, b) => n + b.cleanable, 0);
  const top = Math.max(1, ...boards.map((b) => b.bytes));
  const shown = all ? boards : boards.slice(0, BOARDS_SHOWN);
  const confirm = async () => {
    const list = target === "all" ? ready : target ? [target] : [];
    let freed = 0;
    for (const b of list) {
      await clean(b.id);
      freed += b.cleanable;
    }
    setTarget(null);
    toast.success(tc.cleaned(fmtBytes(freed)));
    await refresh();
  };
  // The page's own refresh button asks for a new measure; opening the tab reuses the last one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the button's press should measure again.
  useEffect(() => {
    if (refreshTick) void refresh();
  }, [refreshTick]);
  return (
    <>
      {failed && !data && <LoadFailed onRetry={() => void load()} />}
      {!data && !failed && (
        <div className="flex flex-col gap-3" role="status" aria-label={tc.measuring}>
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      )}
      {data && (
        <>
          <div className="grid gap-8 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            <div className="flex flex-col gap-1">
              <p className="text-4xl font-medium tracking-tight tabular-nums">{fmtBytes(data.total)}</p>
              <p className="truncate text-xs text-muted-foreground" title={data.dataDir}>
                {tc.total} · <span className="font-mono">{data.dataDir}</span>
              </p>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-xs text-muted-foreground">{tc.canClean}</p>
                <p className="text-lg tabular-nums">{fmtBytes(canClean)}</p>
                <p className="text-xs text-muted-foreground">{tc.canCleanHint}</p>
              </div>
              {ready.length > 0 && (
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setTarget("all")}>
                  {tc.cleanAll}
                </Button>
              )}
            </div>
          </div>

          <Section title={tc.byKind}>
            <ShareBar parts={kindParts(data.kinds)} format={fmtBytes} />
          </Section>

          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-medium">{tc.boardsList}</h2>
              <p className="text-xs text-muted-foreground tabular-nums">{tc.boardCount(boards.length)}</p>
            </div>
            {boards.length === 0 ? (
              <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{tc.noBoards}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] tabular-nums">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th scope="col" className="w-8 py-2 text-start font-normal">
                        #
                      </th>
                      <th scope="col" className="py-2 text-start font-normal">
                        {tc.boards}
                      </th>
                      <th scope="col" className="w-24 py-2 text-end font-normal">
                        {tc.size}
                      </th>
                      <th scope="col" className="w-32 py-2 text-end font-normal">
                        {tc.canClean}
                      </th>
                      <th scope="col" className="w-24 py-2">
                        <span className="sr-only">{tc.cleanOne}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((b, i) => (
                      <tr key={b.id} className="border-b">
                        <td className="py-2.5 align-top text-xs text-muted-foreground">{i + 1}</td>
                        <td className="max-w-0 py-2.5 pe-6">
                          <div className="flex flex-col gap-1.5">
                            <Link
                              to="/boards/$boardId"
                              params={{ boardId: b.id }}
                              title={b.title}
                              className="truncate hover:underline focus-visible:underline focus-visible:outline-none"
                            >
                              {b.title}
                            </Link>
                            {b.bytes / top >= 0.01 && (
                              <span
                                aria-hidden="true"
                                className="h-0.5 max-w-xs rounded-full bg-signal/70"
                                style={{ width: `${(b.bytes / top) * 100}%` }}
                              />
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 text-end align-top">{fmtBytes(b.bytes)}</td>
                        <td className="py-2.5 text-end align-top text-muted-foreground">{b.cleanable ? fmtBytes(b.cleanable) : "—"}</td>
                        <td className="py-1.5 text-end align-top">
                          {b.live ? (
                            <span className="inline-block py-1 text-xs text-muted-foreground">{tc.working}</span>
                          ) : (
                            b.cleanable > 0 && (
                              <Button type="button" variant="ghost" size="sm" onClick={() => setTarget(b)}>
                                {tc.cleanOne}
                              </Button>
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {data.ownFolders > 0 ? <p className="text-xs text-muted-foreground">{tc.ownFolders(data.ownFolders)}</p> : <span />}
              {boards.length > BOARDS_SHOWN && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>
                  {all ? tc.showLess : tc.showAll(boards.length)}
                </Button>
              )}
            </div>
          </section>
        </>
      )}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={target === "all" ? tc.cleanAllTitle : target ? tc.cleanTitle(target.title) : ""}
        desc={<RichText text={target === "all" ? tc.cleanAllText(ready.length) : tc.cleanText} />}
        confirmText={tc.cleanConfirm}
        destructive
        handleConfirm={confirm}
      />
    </>
  );
}
