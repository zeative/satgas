import {
  Brain,
  FileDiff,
  GitBranch,
  GitFork,
  GitPullRequest,
  History,
  ListChecks,
  type LucideIcon,
  MessageSquareText,
  SquareMousePointer,
  Variable,
  Zap,
} from "lucide-react";
import type { WidgetKind } from "../../../shared/widgets";

// Apart from the widget bodies, so the Insert menu and card labels do not pull them all in.
export const WIDGET_ICON: Record<WidgetKind, LucideIcon> = {
  trigger: Zap,
  button: SquareMousePointer,
  checklist: ListChecks,
  variables: Variable,
  comment: MessageSquareText,
  pull: GitPullRequest,
  branch: GitBranch,
  changes: FileDiff,
  round: History,
  fork: GitFork,
  memory: Brain,
};
