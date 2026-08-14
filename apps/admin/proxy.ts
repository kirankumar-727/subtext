import type { NextRequest } from "next/server";

import { createAdminProxyHandler } from "@/lib/auth/proxy-handler";

const handleAdminProxy = createAdminProxyHandler();

export function proxy(request: NextRequest) {
  return handleAdminProxy(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
