# Source Manifest

## Primary Sources

- Upstream repo  
  `external/ipns-site-generator/`
- Matters Lab article  
  <https://matters-lab.io/blog/build-a-decentralized-social-graph-on-the-blockchain-with-meson-network>
- Mastodon ActivityPub docs  
  <https://docs.joinmastodon.org/spec/activitypub/>
- Mastodon instance docs  
  <https://docs.joinmastodon.org/user/run-your-own/>
- DOI metadata  
  <https://api.crossref.org/works/10.1145/3678610.3678624>
- Semantic Scholar metadata  
  <https://api.semanticscholar.org/graph/v1/paper/DOI:10.1145/3678610.3678624?fields=title,abstract,year,venue,authors,citationCount,openAccessPdf,externalIds,fieldsOfStudy>

## Notes

- 2026-03-20 first-pass reading confirms `ipns-site-generator` already emits static WebFinger, actor, and outbox files
- The ACM DOI page is Cloudflare-protected in direct browser access, so metadata and abstract are used as background material in the first pass
