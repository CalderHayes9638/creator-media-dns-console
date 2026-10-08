import { z } from "zod";
import type { MediaDns } from "./infrai_dns.js";

export const publishRequestSchema = z.object({
  asset_id: z.string().min(1),
  creator_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  delivery_domain: z.string().min(3),
  origin_host: z.string().min(3),
  ingestion_status: z.literal("stored"),
  processing_status: z.enum(["queued", "processing", "ready", "failed"]),
  publication_id: z.string().uuid()
});

export type PublishRequest = z.infer<typeof publishRequestSchema>;

export type PublishResult = {
  state: "published";
  asset_id: string;
  zone_id: string;
  delivery_host: string;
};

export class AssetNotReadyError extends Error {
  readonly status = 409;
  public readonly processingStatus: PublishRequest["processing_status"];

  constructor(processingStatus: PublishRequest["processing_status"]) {
    super(`Asset processing state is ${processingStatus}`);
    this.name = "AssetNotReadyError";
    this.processingStatus = processingStatus;
  }
}

export async function publishCreatorAsset(
  dns: MediaDns,
  input: PublishRequest
): Promise<PublishResult> {
  if (input.processing_status !== "ready") {
    throw new AssetNotReadyError(input.processing_status);
  }

  const zoneId = await dns.getOrAddZone(
    input.delivery_domain,
    `${input.publication_id}:zone`
  );
  const deliveryHost = `${input.creator_slug}.media.${input.delivery_domain}`;

  await dns.upsertRecord(
    zoneId,
    {
      record_type: "CNAME",
      name: `${input.creator_slug}.media`,
      content: input.origin_host,
      ttl: 300,
      metadata: { asset_id: input.asset_id, publication_id: input.publication_id }
    },
    `${input.publication_id}:delivery`
  );

  return {
    state: "published",
    asset_id: input.asset_id,
    zone_id: zoneId,
    delivery_host: deliveryHost
  };
}
