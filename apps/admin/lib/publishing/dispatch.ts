import "server-only";

export async function dispatchPublishingWorker() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.PUBLISHING_WORKER_SECRET;
  if (!baseUrl || !secret) return { dispatched: false as const };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(new URL("/functions/v1/publishing-worker", baseUrl), {
        method: "POST",
        headers: { "x-subtext-worker-secret": secret },
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
      if (response.ok) return { dispatched: true as const };
    } catch {
      // Retry once so transient function/network failures do not leave a
      // freshly queued publication job waiting indefinitely.
    }
  }

  return { dispatched: false as const };
}
