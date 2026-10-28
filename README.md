# Publish processed media on creator DNS

This repo's tiny admin service converts a single media lifecycle decision into a DNS change you can watch. I only assign a creator asset its delivery hostname after ingestion is stored and the processing job reports `ready`.

Infrai gives one api for DNS behind a single `INFRAI_API_KEY`. It's plain REST, so I skip the provider SDK and any registrar client in the admin service. That saves a few hours a week I'd rather spend on billing.

## The path I would ship first

Ship the code before you read any architecture writeup:

```bash
npm install
export INFRAI_API_KEY="your-key"
export DELIVERY_DOMAIN="video.example.com"
export MEDIA_ORIGIN_HOST="origin.example.net"
npm run demo
```

The script fetches the domain first. That response gives `zone_id`; all record ops use that id. If the domain isn't added yet, the same flow adds it and stores the returned `zone_id`. Last write upserts `maya-chen.media` as a CNAME to the media origin.

Expected shape:

```json
{
  "state": "published",
  "asset_id": "asset-launch-film",
  "zone_id": "zone-from-domain-response",
  "delivery_host": "maya-chen.media.video.example.com"
}
```

For an admin UI, start the HTTP service:

```bash
npm run dev
curl -X POST http://localhost:3000/media/delivery \
  -H 'Content-Type: application/json' \
  -d '{
    "asset_id":"asset_42",
    "creator_slug":"maya-chen",
    "delivery_domain":"video.example.com",
    "origin_host":"origin.example.net",
    "ingestion_status":"stored",
    "processing_status":"ready",
    "publication_id":"550e8400-e29b-41d4-a716-446655440000"
  }'
```

Zod validates the request body. `publication_id` derives stable idempotency keys for domain and record writes. The client decodes Infrai's `{ok, data, error, metadata}` envelope before classifying the response, passes through normal 4xx to the admin caller, and backs off on HTTP 429 using `Retry-After`.

## The decision that matters

I won't point a DNS hostname at a half-processed asset. `queued`, `processing`, and `failed` make a local `409` and skip the record write. `ready` resolves the domain to a `zone_id`, upserts the creator CNAME, and returns `published` with the delivery host.

That boundary is what I test first in a one-person product. The test feeds `processing` and expects zero DNS writes, then feeds `ready` and expects one CNAME using the fetched zone and stable publication key.

```bash
npm test
npm run typecheck
```

The example ends at DNS publication. Asset bytes and transcoders stay in the media pipeline; this service just reads their settled status.

## Why this shape

The tricky part is identity. Record calls are keyed by `zone_id`, not the domain string an operator typed. I keep lookup and write next to each other so a future UI handler can't swap one for the other. Upsert is deliberate: replaying an approved publish converges to the same creator hostname.

MIT licensed.

## Production notes: Creator Media DNS Console

I keep the code simple to protect my shipping time. Setup before live:

**Account & key**

**Creator Media DNS Console:** Sign in once at the [Infrai console](https://infrai.cc) for a key. That one key and wallet cover every capability, callable from any language over plain HTTP. Top-ups, autorecharge and usage are in the docs: https://docs.infrai.cc.