import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { AuthShell, btn, input, label } from "@/components/ui";
import { safeNext } from "@/lib/paths";
import { getT } from "@/lib/session";
import { signUp } from "../actions";
import { Messages } from "../messages";

const LEGAL = process.env.NEXT_PUBLIC_LANDING_URL ?? "";

export default async function Signup({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  const t = await getT();
  const next = safeNext(sp.next, "/onboarding");
  return (
    <AuthShell title={t.auth.signupTitle}>
      <Messages sp={sp} t={t} />
      <form action={signUp} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <label className={label}>{t.auth.fullName}<input name="full_name" required maxLength={120} autoComplete="name" className={input} /></label>
        <label className={label}>{t.auth.email}<input name="email" type="email" required autoComplete="email" className={input} /></label>
        <label className={label}>
          {t.auth.password}
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className={input} />
          <span className="text-xs font-normal text-muted">{t.auth.passwordHint}</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input name="terms" type="checkbox" required className="mt-1 h-4 w-4 accent-[var(--brand)]" />
          <span>
            {LEGAL ? (
              <a href={`${LEGAL}/es/terms`} target="_blank" rel="noopener noreferrer" className="underline">{t.auth.acceptTerms}</a>
            ) : (
              t.auth.acceptTerms
            )}
          </span>
        </label>
        <SubmitButton className={`${btn} w-full`}>{t.auth.signup}</SubmitButton>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        {t.auth.haveAccount} <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-brand underline">{t.auth.login}</Link>
      </p>
    </AuthShell>
  );
}
