import { InfraiDnsClient } from "./infrai_dns.js";
import { publishCreatorAsset } from "./media_delivery.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the demo");

const result = await publishCreatorAsset(new InfraiDnsClient(apiKey), {
  asset_id: "asset-launch-film",
  creator_slug: "maya-chen",
  delivery_domain: process.env.DELIVERY_DOMAIN ?? "example.com",
  origin_host: process.env.MEDIA_ORIGIN_HOST ?? "origin.example.com",
  ingestion_status: "stored",
  processing_status: "ready",
  publication_id: crypto.randomUUID()
});

console.log(JSON.stringify(result, null, 2));
