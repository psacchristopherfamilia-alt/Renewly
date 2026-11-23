"use client";

import { track } from "@vercel/analytics";
import type { PlanId } from "@/lib/site";
import { PLAN_EVENT } from "./ContactForm";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

/** With the app live, the plan button opens sign-up (free trial, then the plan and payment instructions in Plan). */
export function PlanButton({ plan, className, children }: { plan: PlanId; className: string; children: React.ReactNode }) {
  return (
    <a
      href={APP_URL ? `${APP_URL}/signup?plan=${plan}` : "#contact"}
      className={className}
      onClick={() => {
        track("plan_cta", { plan });
        if (!APP_URL) window.dispatchEvent(new CustomEvent(PLAN_EVENT, { detail: plan }));
      }}
    >
      {children}
    </a>
  );
}
