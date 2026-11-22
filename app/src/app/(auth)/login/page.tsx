import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { AuthShell, btn, btnGhost, input, label } from "@/components/ui";
import { safeNext } from "@/lib/paths";
import { getT } from "@/lib/session";
import { sendMagicLink, signIn } from "../actions";
import { Messages } from "../messages";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; next?: string }> }) {
  const sp = await searchParams;
  const t = await getT();
  const next = safeNext(sp.next);
  return (
    <AuthShell title={t.auth.loginTitle}>
      <Messages sp={sp} t={t} />
      <form action={signIn} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <label className={label}>{t.auth.email}<input name="email" type="email" required autoComplete="email" className={input} /></label>
        <label className={label}>{t.auth.password}<input name="password" type="password" required autoComplete="current-password" className={input} /></label>
        <SubmitButton className={`${btn} w-full`}>{t.auth.login}</SubmitButton>
      </form>
      <p className="my-4 text-center text-xs text-muted">{t.common.or}</p>
      <form action={sendMagicLink} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <label className={label}>{t.auth.email}<input name="email" type="email" required autoComplete="email" className={input} /></label>
        <SubmitButton className={`${btnGhost} w-full`}>{t.auth.magic}</SubmitButton>
      </form>
      <div className="mt-5 space-y-1 text-center text-sm">
        <p><Link href="/forgot" className="text-brand underline">{t.auth.forgot}</Link></p>
        <p className="text-muted">{t.auth.noAccount} <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-brand underline">{t.auth.signup}</Link></p>
        <p><a href={`/lang?to=${t.common.lang === "English" ? "en" : "es"}&next=/login`} className="text-muted underline">{t.common.lang}</a></p>
      </div>
    </AuthShell>
  );
}
