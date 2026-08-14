import "server-only";

export async function dispatchPublishingWorker() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.PUBLISHING_WORKER_SECRET;
  if (!baseUrl || !secret) return { dispatched: false as const };
  try {
    const response = await fetch(new URL("/functions/v1/publishing-worker", baseUrl), {
      method: "POST",
      headers: { "x-subtext-worker-secret": secret },
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    return { dispatched: response.ok } as const;
  } catch {
    return { dispatched: false as const };
  }
}
