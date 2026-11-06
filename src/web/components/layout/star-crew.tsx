import { MiniFace } from "@/features/team/face";

// The same drawn faces the board's team wears, so the ask reads as coming from the crew.
const CREW = ["Nadia", "Raka", "Dewi"];

export default function StarCrew() {
  return CREW.map((seed) => <MiniFace key={seed} seed={seed} className="size-6 ring-2 ring-card" />);
}
