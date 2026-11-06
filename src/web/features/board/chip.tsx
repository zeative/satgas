import { Check } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const CHIP =
  "nodrag inline-flex h-7 items-center rounded-md bg-muted/70 px-2 text-xs font-medium text-foreground tabular-nums transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60 data-[state=open]:bg-muted";

// One editable word in a widget's sentence ("Daily on Weekdays at 09:00"): it opens a small picker beside itself.
export function Chip({
  label,
  title,
  disabled,
  children,
  className,
}: {
  label: React.ReactNode;
  title: string;
  disabled?: boolean;
  children: (close: () => void) => React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={title} title={title} disabled={disabled} className={cn(CHIP, className)}>
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="nodrag nowheel w-auto min-w-40 p-1" onKeyDown={(e) => e.stopPropagation()}>
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

// A chip whose picker is a short list of choices.
export function ChoiceChip<T extends string | number>({
  value,
  options,
  title,
  disabled,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  title: string;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  const current = options.find((o) => o.value === value)?.label ?? String(value);
  return (
    <Chip label={current} title={title} disabled={disabled}>
      {(close) => (
        <div role="listbox" aria-label={title} className="flex flex-col">
          {options.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                close();
                if (o.value !== value) onChange(o.value);
              }}
              className="flex h-8 items-center gap-2 rounded-md px-2 text-start text-xs hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              <Check className={cn("size-3.5 shrink-0", o.value !== value && "invisible")} aria-hidden="true" />
              {o.label}
            </button>
          ))}
        </div>
      )}
    </Chip>
  );
}

export const chipClass = CHIP;
