import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { AuthShell, Notice, btn, btnGhost } from "@/components/ui";
import { acceptInvitation } from "@/lib/actions/org";
import type { Role } from "@/lib/roles";
import { getT, tpl } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export default async function Invite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const t = await getT();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // The preview is only available to signed-in users (the function is not exposed to anonymous visitors).
  const preview = user ? ((await supabase.rpc("invitation_preview", { p_token: token })).data ?? [])[0] as
    { organization_name: string; email: string; role: Role } | undefined : undefined;
  const here = `/invite/${encodeURIComponent(token)}`;

  if (!user) {
    return (
      <AuthShell title="Renewly">
        <p className="mb-4 text-sm text-muted">{t.invite.loginFirst}</p>
        <div className="flex flex-col gap-2">
          <Link href={`/login?next=${encodeURIComponent(here)}`} className={btn}>{t.auth.login}</Link>
          <Link href={`/signup?next=${encodeURIComponent(here)}`} className={btnGhost}>{t.auth.signup}</Link>
        </div>
      </AuthShell>
    );
  }
  if (!preview) {
    return <AuthShell title="Renewly"><Notice kind="error">{t.invite.invalid}</Notice></AuthShell>;
  }
  return (
    <AuthShell title={tpl(t.invite.title, { org: preview.organization_name })}>
      {error && <div className="mb-4"><Notice kind="error">{(t.errors as Record<string, string>)[error] ?? t.errors.generic}</Notice></div>}
      <p className="text-sm">{tpl(t.invite.as, { role: t.roles[preview.role] })}</p>
      <p className="mb-4 text-sm text-muted">{tpl(t.invite.forEmail, { email: preview.email })}</p>
      <form action={acceptInvitation}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton className={`${btn} w-full`}>{t.invite.accept}</SubmitButton>
      </form>
    </AuthShell>
  );
}
