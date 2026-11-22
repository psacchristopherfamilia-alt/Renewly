"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ className, children, confirm }: { className: string; children: React.ReactNode; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "…" : children}
    </button>
  );
}
