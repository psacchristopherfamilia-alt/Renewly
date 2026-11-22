"use client";

import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import type { Dictionary } from "@/i18n";
import { PLAN_IDS, type Locale, type PlanId } from "@/lib/site";

export const PLAN_EVENT = "renewly:plan";

type State = "idle" | "sending" | "ok" | "error" | "rate";

export function ContactForm({ t, plans, lang }: { t: Dictionary["contact"]; plans: Dictionary["pricing"]["plans"]; lang: Locale }) {
  const [plan, setPlan] = useState<PlanId>("undecided");
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("plan");
    if (fromUrl && (PLAN_IDS as readonly string[]).includes(fromUrl)) setPlan(fromUrl as PlanId);
    const onPlan = (e: Event) => setPlan((e as CustomEvent<PlanId>).detail);
    window.addEventListener(PLAN_EVENT, onPlan);
    return () => window.removeEventListener(PLAN_EVENT, onPlan);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setState("sending");
    const fd = new FormData(form);
    const qs = new URLSearchParams(window.location.search);
    const body = {
      ...Object.fromEntries(fd.entries()),
      consent: fd.get("consent") === "on",
      plan,
      locale: lang,
      utm_source: qs.get("utm_source") ?? "",
      utm_medium: qs.get("utm_medium") ?? "",
      utm_campaign: qs.get("utm_campaign") ?? "",
    };
    try {
      const res = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        setState("ok");
        track("lead_submitted", { plan });
        form.reset();
      } else setState(res.status === 429 ? "rate" : "error");
    } catch {
      setState("error");
    }
  }

  const field = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg";
  const label = "block text-sm font-medium";

  if (state === "ok") {
    return <div role="status" className="rounded-xl bg-ok-soft p-6 text-ok">{t.success}</div>;
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate={false}>
      <label className={label}>{t.name}<input name="name" required minLength={2} maxLength={120} autoComplete="name" className={field} /></label>
      <label className={label}>{t.email}<input name="email" type="email" required maxLength={200} autoComplete="email" className={field} /></label>
      <label className={label}>{t.phone}<input name="phone" type="tel" maxLength={40} autoComplete="tel" className={field} /></label>
      <label className={label}>{t.company}<input name="company" maxLength={160} autoComplete="organization" className={field} /></label>
      <label className={label}>{t.properties}<input name="properties" type="number" min={1} max={5000} required inputMode="numeric" className={field} /></label>
      <label className={label}>
        {t.plan}
        <select value={plan} onChange={(e) => setPlan(e.target.value as PlanId)} className={field}>
          <option value="per_property">{plans.per_property.name}</option>
          <option value="manager">{plans.manager.name}</option>
          <option value="undecided">{t.planUndecided}</option>
        </select>
      </label>
      <label className={`${label} sm:col-span-2`}>{t.message}<textarea name="message" rows={3} maxLength={2000} className={field} /></label>
      {/* Honeypot, hidden from people and screen readers. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input name="consent" type="checkbox" required className="mt-1 h-4 w-4 accent-[var(--brand)]" />
        <span>{t.consent} <a href={`/${lang}/privacy`} className="text-brand underline">↗</a></span>
      </label>
      <div className="sm:col-span-2">
        <button type="submit" disabled={state === "sending"} className="w-full rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-brand-fg disabled:opacity-60 sm:w-auto">
          {state === "sending" ? t.sending : t.submit}
        </button>
        <p aria-live="polite" className="mt-3 text-sm text-bad">
          {state === "error" ? t.error : state === "rate" ? t.rateLimited : ""}
        </p>
      </div>
    </form>
  );
}
