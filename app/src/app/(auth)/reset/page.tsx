import { SubmitButton } from "@/components/SubmitButton";
import { AuthShell, btn, input, label } from "@/components/ui";
import { getT } from "@/lib/session";
import { updatePassword } from "../actions";
import { Messages } from "../messages";

export default async function Reset({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const t = await getT();
  return (
    <AuthShell title={t.auth.resetTitle}>
      <Messages sp={sp} t={t} />
      <form action={updatePassword} className="space-y-4">
        <label className={label}>
          {t.auth.password}
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className={input} />
          <span className="text-xs font-normal text-muted">{t.auth.passwordHint}</span>
        </label>
        <SubmitButton className={`${btn} w-full`}>{t.common.save}</SubmitButton>
      </form>
    </AuthShell>
  );
}
