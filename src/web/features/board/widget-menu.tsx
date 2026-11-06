import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";
import type { WidgetKind } from "../../../shared/widgets";
import { WIDGET_ICON } from "./widget-icon";

const OWN: WidgetKind[] = ["trigger", "button", "checklist", "variables", "comment"];
// These draw something the board already has; each starts as a picker of what to show.
const LIVE: WidgetKind[] = ["pull", "branch", "changes", "round", "fork", "memory"];

// The widgets, the same list in the toolbar's Insert menu and the right-click Add menu.
export function WidgetMenuItems({ onPick }: { onPick: (widget: WidgetKind) => void }) {
  const item = (w: WidgetKind) => {
    const Icon = WIDGET_ICON[w];
    return (
      <DropdownMenuItem key={w} onSelect={() => onPick(w)}>
        <Icon />
        {t.widget.kind[w]}
      </DropdownMenuItem>
    );
  };
  return (
    <>
      {OWN.map(item)}
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t.widget.live}</DropdownMenuLabel>
      {LIVE.map(item)}
    </>
  );
}
