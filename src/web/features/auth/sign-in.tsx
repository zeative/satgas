import { useId, useState } from "react";
import { LogoMark } from "@/components/logo";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { signIn } from "@/stores/auth";

// Shown instead of the app when the server says this browser hasn't signed in yet.
export function SignIn() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useId();
  const hint = useId();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim() || busy) return;
    setBusy(true);
    setError(null);
    const failed = await signIn(token.trim()).catch(() => t.auth.failed);
    if (failed) {
      setError(failed);
      setBusy(false);
    }
  };

  return (
    <main id="content" className="flex min-h-svh items-center justify-center px-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2">
          <LogoMark />
          <span className="brand-title text-base">Satgas</span>
        </div>
        <h1 className="brand-title text-2xl">{t.auth.title}</h1>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={field} className="text-xs text-muted-foreground">
              {t.auth.label}
            </label>
            <Input
              id={field}
              type="password"
              autoComplete="current-password"
              autoFocus
              value={token}
              onChange={(e) => setToken(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={hint}
              className="font-mono"
            />
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" disabled={busy || !token.trim()}>
            {busy ? t.auth.busy : t.auth.submit}
          </Button>
        </form>
        <p id={hint} className="text-xs leading-5 text-muted-foreground">
          <RichText text={t.auth.help} />
        </p>
      </div>
    </main>
  );
}
