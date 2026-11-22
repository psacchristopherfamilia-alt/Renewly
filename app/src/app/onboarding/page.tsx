import { SubmitButton } from "@/components/SubmitButton";
import { AuthShell, Notice, btn, input, label } from "@/components/ui";
import { createOrganization } from "@/lib/actions/org";
import { getT, requireUser } from "@/lib/session";

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser();
  const { error } = await searchParams;
  const t = await getT();
  return (
    <AuthShell title={t.onboarding.title}>
      <p className="mb-4 text-sm text-muted">{t.onboarding.subtitle}</p>
      {error && <div className="mb-4"><Notice kind="error">{(t.errors as Record<string, string>)[error] ?? t.errors.generic}</Notice></div>}
      <form action={createOrganization} className="space-y-4">
        <label className={label}>{t.onboarding.name}<input name="name" required minLength={2} maxLength={120} placeholder={t.onboarding.placeholder} className={input} /></label>
        <SubmitButton className={`${btn} w-full`}>{t.onboarding.create}</SubmitButton>
      </form>
    </AuthShell>
  );
}
