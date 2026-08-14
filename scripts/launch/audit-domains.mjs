import { resolve4, resolveCname, resolveNs } from "node:dns/promises";

async function dns(name) {
  const result = { name, addresses: [], cnames: [] };
  try {
    result.addresses = await resolve4(name);
  } catch {
    // Missing A records are reported as an empty result.
  }
  try {
    result.cnames = await resolveCname(name);
  } catch {
    // Missing CNAME records are reported as an empty result.
  }
  return result;
}

const publicHost = process.env.PUBLIC_HOST ?? "subtext.media";
const adminHost = process.env.ADMIN_HOST ?? "admin.subtext.media";
const [publicDns, adminDns] = await Promise.all([dns(publicHost), dns(adminHost)]);
let nameservers = [];
try {
  nameservers = await resolveNs(publicHost);
} catch {
  // Missing nameservers remain visible as an empty result.
}
console.log(JSON.stringify({ public: publicDns, admin: adminDns, nameservers }, null, 2));

let publicPlatform = "unreachable";
try {
  const response = await fetch(`https://${publicHost}`, { signal: AbortSignal.timeout(10_000) });
  const html = await response.text();
  publicPlatform = /cdn\/shop|Shopify/i.test(html)
    ? "shopify-or-storefront"
    : /Everything has a subtext|Subtext Media —/i.test(html)
      ? "subtext-editorial"
      : "unknown";
  console.log(`public HTTPS: ${response.status}; detected origin: ${publicPlatform}`);
} catch {
  console.log("public HTTPS: unreachable");
}
try {
  const response = await fetch(`https://${adminHost}/login`, {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  console.log(`admin HTTPS: ${response.status}`);
} catch {
  console.log("admin HTTPS: unreachable");
}
if (
  publicPlatform !== "subtext-editorial" ||
  (!adminDns.addresses.length && !adminDns.cnames.length)
) {
  console.error(
    "Domain audit failed: production origins do not yet point to the complete Subtext platform.",
  );
  process.exitCode = 1;
}
