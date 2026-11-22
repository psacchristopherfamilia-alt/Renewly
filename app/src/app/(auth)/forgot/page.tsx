import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { AuthShell, btn, input, label } from "@/components/ui";
import { getT } from "@/lib/session";
import { sendReset } from "../actions";
import { Messages } from "../messages";

export default async function Forgot({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const t = await getT();
  return (
    <AuthShell title={t.auth.forgotTitle}>
      <Messages sp={sp} t={t} />
      <form action={sendReset} className="space-y-4">
        <label className={label}>{t.auth.email}<input name="email" type="email" required autoComplete="email" className={input} /></label>
        <SubmitButton className={`${btn} w-full`}>{t.auth.sendReset}</SubmitButton>
      </form>
      <p className="mt-5 text-center text-sm"><Link href="/login" className="text-brand underline">{t.common.back}</Link></p>
    </AuthShell>
  );
}
