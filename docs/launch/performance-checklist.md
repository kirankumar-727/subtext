# Launch Performance Checklist

## Automated

- [x] Public site is server-rendered with one intentional client component (error recovery).
- [x] Published datasets use cache tags and targeted revalidation.
- [x] Responsive public media has intrinsic dimensions, srcset and lazy/priority behavior.
- [x] No external font, analytics, ad or UI runtime is loaded.
- [x] Build budget script enforces <500 KB total gzip JavaScript and <150 KB CSS.

Run `npm run launch:build-audit` after production builds.

## Production measurements

- [ ] Homepage mobile LCP ≤2.5s at p75.
- [ ] Article mobile LCP ≤2.5s at p75.
- [ ] INP ≤200ms and CLS ≤0.1.
- [ ] Hero derivative is correctly sized and CDN-cached.
- [ ] Search response is acceptable from target geography.
- [ ] Cache hit/miss behavior changes correctly after publication.
- [ ] Mobile, tablet and desktop network waterfalls reviewed.
- [ ] No unexpected third-party requests.

Use production browser DevTools or Lighthouse after DNS/deployment. Local build size is not a substitute for field/CDN performance.
