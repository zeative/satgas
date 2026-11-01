import { toast } from "sonner";
import { saveSettings } from "@/stores/settings";
import type { Settings } from "../../../shared/settings";

// Applies at once; a refused save is reverted by the store and its reason shown.
export async function update(next: Settings): Promise<boolean> {
  const problem = await saveSettings(next);
  if (problem) toast.error(problem);
  return !problem;
}
