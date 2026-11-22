import type { Instrumentation } from "next";

// Every unhandled server error is logged as one JSON line, so the hosting log search and alerts can pick it up.
// Swap for Sentry (or similar) once there is an account: this is the single place to change.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      msg: e.message,
      digest: e.digest,
      path: request.path,
      method: request.method,
      route: context.routePath,
      kind: context.routeType,
      at: new Date().toISOString(),
    }),
  );
};
