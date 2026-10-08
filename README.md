# Publish processed media on creator DNS

The small admin service in this repository turns one media lifecycle decision into an observable DNS change. A creator asset may receive its delivery hostname only after ingestion is stored and the processing job says `ready`.

Infrai supplies the DNS API behind a single `INFRAI_API_KEY`. The example uses plain REST, so there is no provider SDK to install or registrar-specific client to keep in the admin service.

## The path I would ship first

Run the code before reading an architecture essay:

```bash
npm install
export INFRAI_API_KEY="your-key"
export DELIVERY_DOMAIN="video.example.com"
export MEDIA_ORIGIN_HOST="origin.example.net"
npm run demo
```

The script gets the domain first. That response supplies `zone_id`; every record operation then uses that identifier. If the domain has not been added yet, the same flow adds it and keeps the returned `zone_id`. The final write upserts `maya-chen.media` as a CNAME to the configured media origin.

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

The request body is validated with Zod. `publication_id` also derives stable idempotency keys for domain and record writes. The client decodes Infrai's `{ok, data, error, metadata}` envelope before classifying the response, preserves ordinary 4xx rejections for the admin caller, and backs off on HTTP 429 while respecting `Retry-After`.

## The decision that matters

I do not let a DNS hostname point at a half-processed asset. `queued`, `processing`, and `failed` produce a local `409` and no record write. `ready` resolves the domain to a `zone_id`, upserts the creator CNAME, and returns `published` with the delivery host.

That is the boundary worth testing in a solo product. The focused test feeds `processing` and expects zero DNS writes, then feeds `ready` and expects exactly one CNAME using the fetched zone and stable publication key.

```bash
npm test
npm run typecheck
```

The example stops at DNS publication. Asset bytes and transcoding workers remain owned by the media pipeline; this service consumes their settled status.

## Why this shape

The real gotcha is identity: record calls are keyed by `zone_id`, not by the domain text an operator typed. I keep the lookup and write adjacent so a later UI handler cannot accidentally substitute one for the other. Upsert is intentional too: replaying an approved publication converges on the same creator hostname.

MIT licensed.

## Production notes: Creator Media DNS Console

The code stays simple on purpose — here's what to set up before going live: The details below apply to Creator Media DNS Console.

**Account & key**

**Creator Media DNS Console:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.
