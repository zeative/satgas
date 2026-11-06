import { Check, X } from "lucide-react";
import { memo } from "react";
import { avatarTint, avatarUri } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import type { PersonState } from "../../../shared/team";

interface Props {
  seed: string;
  state?: PersonState | "lead";
  size?: number;
  className?: string;
  children?: React.ReactNode;
}

// A drawn face on its own tint; the ring around it says what the person is doing.
export const Face = memo(function Face({ seed, state = "idle", size = 64, className, children }: Props) {
  const box = size + 8;
  return (
    <span
      className={cn(
        "relative inline-block shrink-0 rounded-full",
        state === "waiting" && "border-[1.5px] border-dashed border-foreground/20",
        className,
      )}
      style={{ width: box, height: box }}
    >
      {state === "working" && <span className="satgas-face-ring" aria-hidden="true" />}
      <img
        src={avatarUri(seed)}
        alt=""
        draggable={false}
        className={cn("absolute rounded-full", state === "idle" && "opacity-45 grayscale")}
        style={{ inset: 4, width: size, height: size, background: avatarTint(seed) }}
      />
      {state === "done" && (
        <Badge className="bg-emerald-600 text-white dark:bg-emerald-500">
          <Check className="size-3" strokeWidth={3} />
        </Badge>
      )}
      {state === "failed" && (
        <Badge className="bg-destructive text-white">
          <X className="size-3" strokeWidth={3} />
        </Badge>
      )}
      {children}
    </span>
  );
});

export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn("absolute right-0.5 bottom-0.5 grid size-[22px] place-items-center rounded-full border-2 border-background", className)}
    >
      {children}
    </span>
  );
}

// A small face for lists and chat rows.
export function MiniFace({ seed, className }: { seed: string; className?: string }) {
  return (
    <img
      src={avatarUri(seed)}
      alt=""
      draggable={false}
      className={cn("size-5 shrink-0 rounded-full", className)}
      style={{ background: avatarTint(seed) }}
    />
  );
}
