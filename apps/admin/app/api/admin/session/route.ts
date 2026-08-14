import { NextResponse } from "next/server";

import { withAdminApi } from "@/lib/auth/api";

export const GET = withAdminApi(async () =>
  NextResponse.json({ authenticated: true, authorized: true }),
);
