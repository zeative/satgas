import { create } from "zustand";
import type { Schedule } from "../../shared/schedules";
import { request } from "./runs";

export type Listed = Schedule & { nextRunAt: number | null };

interface State {
  list: Listed[] | null;
  timeZone: string;
  hookBase: string;
  error: string | null;
}

export const useSchedules = create<State>(() => ({ list: null, timeZone: "", hookBase: "", error: null }));

export async function loadSchedules() {
  try {
    const res = await fetch("/api/schedules");
    if (!res.ok) throw new Error(`(${res.status})`);
    const data = (await res.json()) as { schedules: Listed[]; timeZone: string; hookBase: string };
    useSchedules.setState({ list: data.schedules, timeZone: data.timeZone, hookBase: data.hookBase, error: null });
  } catch (e) {
    useSchedules.setState({ error: (e as Error).message });
  }
}

// Every change reloads the list, so next-run times come from the server's own clock.
export async function saveSchedule(input: unknown, id?: string): Promise<Schedule> {
  const saved = (await request(id ? "PUT" : "POST", id ? `/api/schedules/${id}` : "/api/schedules", input)) as Schedule;
  await loadSchedules();
  return saved;
}

export async function deleteSchedule(id: string) {
  await request("DELETE", `/api/schedules/${id}`);
  await loadSchedules();
}

export async function runScheduleNow(id: string): Promise<string | undefined> {
  const r = (await request("POST", `/api/schedules/${id}/run`, {})) as { boardId?: string };
  await loadSchedules();
  return r.boardId;
}
