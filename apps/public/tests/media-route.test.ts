import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabasePublicServerClientMock = vi.hoisted(() => vi.fn());

vi.mock("@subtext/supabase/public-server", () => ({
  createSupabasePublicServerClient: createSupabasePublicServerClientMock,
}));

import { GET } from "@/app/api/media/[variantId]/route";

const variantId = "90000000-0000-4000-8000-000000000001";
const signedUrl = `https://project.supabase.co/storage/v1/object/sign/media-public/${variantId}/w1280.webp?token=short-lived`;

function resultBuilder(result: unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(result),
  };
  return builder;
}

function configureProjection(row: { variant_id: string } | null, status = 307) {
  const client = {
    from: vi.fn(() => resultBuilder({ data: row, error: null })),
  };
  createSupabasePublicServerClientMock.mockReturnValue(client);
  const responseInit: ResponseInit = { status };
  if (status === 307) responseInit.headers = { location: signedUrl };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, responseInit)));
  return { client };
}

async function requestFor(value: string) {
  return GET(new Request(`https://subtext.media/api/media/${value}`), {
    params: Promise.resolve({ variantId: value }),
  });
}

describe("controlled public media delivery", () => {
  beforeEach(() => {
    createSupabasePublicServerClientMock.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("PUBLIC_MEDIA_SIGNER_SECRET", "media-signer-secret");
  });

  it("resolves the public projection and proxies a 600-second Edge Function signer", async () => {
    const { client } = configureProjection({ variant_id: variantId });

    const response = await requestFor(variantId);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(signedUrl);
    expect(client.from).toHaveBeenCalledWith("published_media");
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/functions/v1/public-media",
        search: `?variant_id=${variantId}`,
      }),
      expect.objectContaining({
        cache: "no-store",
        redirect: "manual",
        headers: { "x-subtext-media-signer-secret": "media-signer-secret" },
      }),
    );
  });

  it.each(["unpublished", "restricted", "unknown-rights", "processing", "failed"])(
    "denies %s media when it is absent from the published projection",
    async () => {
      configureProjection(null);

      const response = await requestFor(variantId);

      expect(response.status).toBe(404);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(["not-a-uuid", "../../media-public/secret", "../90000000-0000-4000-8000-000000000001"])(
    "rejects invalid UUID and path-injection input: %s",
    async (value) => {
      const response = await requestFor(value);

      expect(response.status).toBe(404);
      expect(createSupabasePublicServerClientMock).not.toHaveBeenCalled();
    },
  );

  it("fails closed when the privileged signer cannot issue a signed redirect", async () => {
    configureProjection({ variant_id: variantId }, 404);

    const response = await requestFor(variantId);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });
});
