# Production Domain Audit

**Observed:** 9 August 2026

| Check                     | Observed result                               | Launch requirement                                                                                  |
| ------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `subtext.media` A record  | `23.227.38.66`                                | Must point to the approved Vercel Public project                                                    |
| Public HTTPS origin       | HTTP 200, Shopify/storefront markers detected | Must render the Subtext editorial application                                                       |
| `admin.subtext.media`     | No A or CNAME record resolved                 | Must point to the Vercel Admin project with TLS                                                     |
| Authoritative nameservers | `ns-cloud-d1/d2/d3/d4.googledomains.com`      | Cloudflare is not currently authoritative; decide whether to retain Google DNS or migrate carefully |

This is a launch blocker, not a code defect. Before DNS changes:

1. Confirm legal and operational control of the domain.
2. Export every current DNS record, especially MX/TXT mail configuration.
3. Confirm whether the Shopify storefront is intentional and whether it must be preserved elsewhere.
4. Attach domains to the correct Vercel projects and verify ownership records.
5. Cut over with low TTL and a documented rollback value.
6. Re-run `npm run launch:domain-audit` and the production black-box validator.
