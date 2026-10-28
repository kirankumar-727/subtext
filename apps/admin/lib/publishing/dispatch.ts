import "server-only";

export type WorkerDispatchResult = {
  dispatched: boolean;
  reason?: "missing_env" | "http_error" | "network_error";
  status?: number;
};

// Posts a claim request to the publishing-worker Edge Function.
// Diagnostics are logged without ever printing secret values: only the
// environment-variable names, HTTP status codes, and error messages.
export async function dispatchPublishingWorker(): Promise<WorkerDispatchResult> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.PUBLISHING_WORKER_SECRET;
  if (!baseUrl || !secret) {
    console.warn(
      "[publishing-dispatch] skipped: NEXT_PUBLIC_SUPABASE_URL or PUBLISHING_WORKER_SECRET is not configured",
    );
    return { dispatched: false, reason: "missing_env" };
  }

  let lastStatus: number | undefined;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(new URL("/functions/v1/publishing-worker", baseUrl), {
        method: "POST",
        headers: { "x-subtext-worker-secret": secret },
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
      if (response.ok) {
        if (attempt > 1) console.warn(`[publishing-dispatch] succeeded on attempt ${attempt}`);
        return { dispatched: true };
      }
      lastStatus = response.status;
      console.warn(`[publishing-dispatch] attempt ${attempt}/2 returned HTTP ${response.status}`);
    } catch (error) {
      console.warn(
        `[publishing-dispatch] attempt ${attempt}/2 failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  console.error(
    `[publishing-dispatch] giving up after 2 attempts (lastStatus=${
      lastStatus ?? "none"
    }); the job stays queued for the nightly publishing tick`,
  );
  return {
    dispatched: false,
    reason: lastStatus === undefined ? "network_error" : "http_error",
    ...(lastStatus === undefined ? {} : { status: lastStatus }),
  };
}
