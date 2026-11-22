"use client";

import { track } from "@vercel/analytics";

/** Anchor that records a conversion event before navigating. */
export function TrackLink({
  event,
  data,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { event: string; data?: Record<string, string> }) {
  return (
    <a
      {...props}
      onClick={(e) => {
        track(event, data);
        props.onClick?.(e);
      }}
    />
  );
}
