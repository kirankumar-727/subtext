# Public Website Architecture

![public-website-architecture](./public-website-architecture.svg)

```mermaid
flowchart LR
  CMS --> Revision[Immutable Revision]
  Revision --> Job[Publication Job]
  Job --> Engine[Publishing Engine]
  Engine --> Views[Safe Public Views]
  Views --> Next[Public Next.js]
  Next --> CDN[Targeted Cache/CDN]
```
