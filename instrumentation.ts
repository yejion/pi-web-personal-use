export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { configureHttpDispatcher } = await import("@/lib/http-dispatcher");
  configureHttpDispatcher();

  // Warm the session-list cache in the background. The first /api/sessions
  // call then shares this in-flight scan instead of reading every .jsonl and
  // spawning git per project on the page-load critical path.
  void import("@/lib/session-reader")
    .then(({ listAllSessions }) => listAllSessions())
    .catch(() => { /* warm-up is best-effort */ });
}
