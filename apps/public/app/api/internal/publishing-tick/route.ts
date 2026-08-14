import "server-only";
import { timingSafeEqual } from "node:crypto";

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const workerSecret = process.env.PUBLISHING_WORKER_SECRET;
  if (!baseUrl || !workerSecret)
    return Response.json({ error: "worker_not_configured" }, { status: 503 });
  try {
    const response = await fetch(new URL("/functions/v1/publishing-worker", baseUrl), {
      method: "POST",
      headers: { "x-subtext-worker-secret": workerSecret },
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    return Response.json(
      { dispatched: response.ok },
      { status: response.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "worker_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
