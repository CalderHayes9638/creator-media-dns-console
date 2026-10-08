import assert from "node:assert/strict";
import test from "node:test";
import type { DeliveryRecord, MediaDns } from "../src/infrai_dns.js";
import { AssetNotReadyError, publishCreatorAsset } from "../src/media_delivery.js";

class RecordingDns implements MediaDns {
  readonly writes: Array<{ zoneId: string; record: DeliveryRecord; key: string }> = [];

  async getOrAddZone(): Promise<string> {
    return "zone_creator_media";
  }

  async upsertRecord(zoneId: string, record: DeliveryRecord, key: string): Promise<void> {
    this.writes.push({ zoneId, record, key });
  }
}

const baseInput = {
  asset_id: "asset_42",
  creator_slug: "maya-chen",
  delivery_domain: "video.example.com",
  origin_host: "media-origin.example.net",
  ingestion_status: "stored" as const,
  publication_id: "550e8400-e29b-41d4-a716-446655440000"
};

test("publishes one creator CNAME only after processing is ready", async () => {
  const dns = new RecordingDns();
  const result = await publishCreatorAsset(dns, {
    ...baseInput,
    processing_status: "ready"
  });

  assert.equal(result.state, "published");
  assert.equal(result.zone_id, "zone_creator_media");
  assert.deepEqual(dns.writes, [{
    zoneId: "zone_creator_media",
    record: {
      record_type: "CNAME",
      name: "maya-chen.media",
      content: "media-origin.example.net",
      ttl: 300,
      metadata: {
        asset_id: "asset_42",
        publication_id: "550e8400-e29b-41d4-a716-446655440000"
      }
    },
    key: "550e8400-e29b-41d4-a716-446655440000:delivery"
  }]);
});

test("keeps DNS unchanged while the processing job is active", async () => {
  const dns = new RecordingDns();

  await assert.rejects(
    publishCreatorAsset(dns, { ...baseInput, processing_status: "processing" }),
    AssetNotReadyError
  );
  assert.equal(dns.writes.length, 0);
});
