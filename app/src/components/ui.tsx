import Link from "next/link";

export const input = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg";
export const label = "block text-sm font-medium";
export const btn = "inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg transition hover:opacity-90 disabled:opacity-60";
export const btnGhost = "inline-flex items-center justify-center rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-fg transition hover:border-brand";
export const btnDanger = "inline-flex items-center justify-center rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-bad transition hover:border-bad";
export const card = "rounded-xl border border-line bg-surface p-5";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-bold tracking-tight text-fg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/renewly-mark.svg" alt="" width={28} height={28} />
      <span className="text-lg">Renewly</span>
    </Link>
  );
}

export function Notice({ kind, children }: { kind: "ok" | "error"; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-lg p-3 text-sm ${kind === "ok" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>
      {children}
    </p>
  );
}

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <div className={card}>
          <h1 className="mb-4 font-display text-2xl">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
