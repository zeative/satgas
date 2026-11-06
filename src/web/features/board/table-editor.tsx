import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { t } from "@/i18n";
import type { Card } from "../../../shared/board";
import { useBoard } from "./context";

const at = (rows: string[][], r: number, c: number) => rows[r]?.[c] ?? "";

// A person's table edited cell by cell: Tab and Enter move on, the last row and column grow it, and the whole table
// saves once focus leaves it, so one edit is one undo step.
export function TableEditor({ card }: { card: Card }) {
  const { commit, setEditingId, hasCard } = useBoard();
  const start = card.rows?.length ? card.rows : [["", "", ""]];
  const [rows, setRows] = useState(start);
  const box = useRef<HTMLFieldSetElement>(null);
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const latest = useRef(rows);
  latest.current = rows;

  const save = () => {
    const next = latest.current.map((r) => Array.from({ length: cols }, (_, c) => r[c] ?? ""));
    if (JSON.stringify(next) === JSON.stringify(card.rows ?? [])) return;
    if (hasCard(card.id)) commit([{ op: "patch", id: card.id, patch: { rows: next } }]);
    else toast.error(t.board.editLost);
  };
  // Leaving mid-edit (scrolled away, zoomed out) still keeps the words.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => () => saveRef.current(), []);
  useEffect(() => box.current?.querySelector<HTMLInputElement>("input")?.focus(), []);

  const set = (r: number, c: number, value: string) =>
    setRows((prev) => prev.map((row, i) => (i === r ? Array.from({ length: cols }, (_, j) => (j === c ? value : (row[j] ?? ""))) : row)));
  const addRow = () => setRows((prev) => [...prev, Array.from({ length: cols }, () => "")]);
  const addCol = () => setRows((prev) => prev.map((r) => [...r, ""]));
  const focusCell = (r: number, c: number) =>
    requestAnimationFrame(() => box.current?.querySelector<HTMLInputElement>(`[data-cell="${r}:${c}"]`)?.focus());

  return (
    <fieldset
      ref={box}
      aria-label={t.board.kind.table}
      className="nodrag nowheel m-0 flex size-full min-w-0 flex-col overflow-auto border-0 p-0"
      onBlur={(e) => {
        if (box.current?.contains(e.relatedTarget as Node | null)) return;
        save();
        setEditingId(null);
      }}
    >
      <table className="w-full border-collapse text-xs">
        <tbody>
          {rows.map((_, r) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity beyond their place while editing.
            <tr key={r} className="border-b">
              {Array.from({ length: cols }, (_, c) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: cells have no identity beyond their place.
                <td key={c} className="p-0">
                  <input
                    data-cell={`${r}:${c}`}
                    value={at(rows, r, c)}
                    aria-label={`${t.board.kind.table} ${r + 1}:${c + 1}`}
                    onChange={(e) => set(r, c, e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Escape") e.currentTarget.blur();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (r === rows.length - 1) addRow();
                        focusCell(r + 1, c);
                      }
                      if (e.key === "Tab" && !e.shiftKey && r === rows.length - 1 && c === cols - 1) {
                        e.preventDefault();
                        addRow();
                        focusCell(r + 1, 0);
                      }
                    }}
                    className={`h-8 w-full min-w-20 bg-transparent px-2.5 outline-none focus-visible:bg-muted/60 ${r === 0 ? "font-medium" : "tabular-nums"}`}
                  />
                </td>
              ))}
              <td className="w-0 p-0" />
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-1 p-1.5">
        <button
          type="button"
          onClick={addRow}
          className="flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {t.board.addRow}
        </button>
        <button
          type="button"
          onClick={addCol}
          className="flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {t.board.addColumn}
        </button>
      </div>
    </fieldset>
  );
}
