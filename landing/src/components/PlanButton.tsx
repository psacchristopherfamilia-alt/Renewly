"use client";

import { track } from "@vercel/analytics";
import type { PlanId } from "@/lib/site";
import { PLAN_EVENT } from "./ContactForm";

/** Plan CTA: preselects the plan in the contact form and scrolls to it. */
export function PlanButton({ plan, className, children }: { plan: PlanId; className: string; children: React.ReactNode }) {
  return (
    <a
      href="#contact"
      className={className}
      onClick={() => {
        track("plan_cta", { plan });
        window.dispatchEvent(new CustomEvent(PLAN_EVENT, { detail: plan }));
      }}
    >
      {children}
    </a>
  );
}
