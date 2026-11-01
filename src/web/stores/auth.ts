import { create } from "zustand";
import { t } from "@/i18n";

interface AuthState {
  // Set when the server answers that this browser hasn't signed in; the app then shows the sign-in screen.
  needed: boolean;
}

export const useAuth = create<AuthState>(() => ({ needed: false }));

const apiPath = (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return new URL(url, window.location.origin).pathname;
};

// Every API call goes through fetch, so one wrapper turns any sign-in refusal into the sign-in screen.
export function watchAuth() {
  const original = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init);
    if (res.status === 401 && apiPath(input).startsWith("/api/") && apiPath(input) !== "/api/auth") {
      const body = (await res
        .clone()
        .json()
        .catch(() => null)) as { signIn?: boolean } | null;
      if (body?.signIn) useAuth.setState({ needed: true });
    }
    return res;
  }) as typeof fetch;
}

export async function signIn(token: string): Promise<string | null> {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  // A reload lets every store and the socket start over with the new cookie.
  if (res.ok) {
    window.location.reload();
    return null;
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? t.auth.failed;
}

export async function signOut() {
  await fetch("/api/auth", { method: "DELETE" }).catch(() => {});
  window.location.reload();
}
