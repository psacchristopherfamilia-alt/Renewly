"use client";

import { useState, useTransition } from "react";

type Step = { title: string; text: string };

/** First-visit tour: a few cards over the dashboard. Finishing or skipping it is saved on the profile. */
export function Tour({ steps, labels, onFinish }: { steps: Step[]; labels: { next: string; done: string; skip: string }; onFinish: () => Promise<void> }) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(true);
  const [pending, start] = useTransition();
  if (!open) return null;
  const finish = () => start(async () => { await onFinish(); setOpen(false); });
  const last = i === steps.length - 1;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="tour-title" className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl">
        <p className="text-xs font-semibold text-brand">{i + 1} / {steps.length}</p>
        <h2 id="tour-title" className="mt-1 font-display text-xl">{steps[i].title}</h2>
        <p className="mt-2 text-sm text-muted">{steps[i].text}</p>
        <div className="mt-5 flex items-center justify-between">
          <button onClick={finish} disabled={pending} className="text-sm text-muted underline">{labels.skip}</button>
          <button
            onClick={() => (last ? finish() : setI(i + 1))}
            disabled={pending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-fg disabled:opacity-60"
          >
            {last ? labels.done : labels.next}
          </button>
        </div>
      </div>
    </div>
  );
}
