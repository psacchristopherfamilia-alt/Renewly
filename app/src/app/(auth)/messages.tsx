import { Notice } from "@/components/ui";
import type { Dictionary } from "@/i18n/es";

type SP = { error?: string; ok?: string };

/** Shows ?error= / ?ok= codes as translated messages. Unknown codes fall back to a generic text. */
export function Messages({ sp, t }: { sp: SP; t: Dictionary }) {
  const err = sp.error ? (t.errors as Record<string, string>)[sp.error] ?? t.errors.generic : "";
  const ok = sp.ok ? (t.auth as Record<string, string>)[sp.ok] ?? "" : "";
  return (
    <div className="mb-4 space-y-2 empty:hidden">
      {err && <Notice kind="error">{err}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}
    </div>
  );
}
