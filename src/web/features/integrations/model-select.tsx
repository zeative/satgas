import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { RichText } from "@/components/rich-text";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ProviderDef } from "../../../shared/providers";
import type { ModelInfo } from "../../../shared/types";
import { ProviderLogo } from "./providers";

const ti = t.integrations;

// A searchable model list with each model's own one-line description, in place of a bare select.
export function ModelSelect({
  id,
  def,
  models,
  value,
  withDefault,
  onChange,
}: {
  id: string;
  def: ProviderDef | undefined;
  models: ModelInfo[];
  value: string;
  // CLI sign-ins have a default of their own, so "let the CLI choose" is a real option there.
  withDefault: boolean;
  onChange: (model: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rows: ModelInfo[] = withDefault ? [{ id: "", name: ti.defaultModel, desc: ti.cliChooses }, ...models] : models;
  const current = rows.find((m) => m.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          className="flex h-8 w-56 items-center gap-2 rounded-lg border border-input px-3 text-start text-sm transition-colors hover:bg-input/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/30"
        >
          {def && <ProviderLogo def={def} className="size-4 shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{current?.name ?? (value ? <RichText text={`\`${value}\``} /> : ti.defaultModel)}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 overflow-hidden p-0">
        <Command className="rounded-none bg-transparent" loop>
          <CommandInput placeholder={t.picker.search} className="h-9 py-0" />
          <CommandList className="max-h-80 p-1">
            <CommandEmpty className="px-2 py-6 text-center text-sm text-muted-foreground">{t.picker.noModels}</CommandEmpty>
            <CommandGroup className="p-0">
              {rows.map((m) => (
                <CommandItem
                  key={m.id || "default"}
                  value={`${m.name} ${m.id} ${m.desc ?? ""}`}
                  onSelect={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className="items-start gap-2 rounded-md px-2 py-1.5"
                >
                  {def && <ProviderLogo def={def} className="mt-0.5 size-4 shrink-0" />}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{m.name}</span>
                    {m.desc && <span className="line-clamp-1 text-xs text-muted-foreground">{m.desc}</span>}
                  </span>
                  <Check className={cn("mt-0.5 size-4 shrink-0", m.id === value ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
