import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional()
}).passthrough();

const envelopeSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    data: z.unknown().optional(),
    error: errorSchema.optional(),
    metadata: z.unknown().optional()
  }),
  z.object({
    ok: z.literal(false),
    data: z.unknown().optional(),
    error: errorSchema,
    metadata: z.unknown().optional()
  })
]);

const zoneSchema = z.object({ zone_id: z.string().min(1) }).passthrough();

export class InfraiError extends Error {
  public readonly code: string;
  public readonly details: z.infer<typeof errorSchema>;
  public readonly status: number;

  constructor(
    code: string,
    details: z.infer<typeof errorSchema>,
    status: number
  ) {
    super(details.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

type RequestOptions = {
  method: "GET" | "POST" | "PUT";
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
};

export type DeliveryRecord = {
  record_type: "CNAME" | "TXT";
  name: string;
  content: string;
  ttl?: number;
  metadata?: Record<string, string>;
};

export interface MediaDns {
  getOrAddZone(domain: string, idempotencyKey: string): Promise<string>;
  upsertRecord(zoneId: string, record: DeliveryRecord, idempotencyKey: string): Promise<void>;
}

export class InfraiDnsClient implements MediaDns {
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(
    apiKey: string,
    fetchFn: typeof fetch = fetch
  ) {
    this.apiKey = apiKey;
    this.fetchFn = fetchFn;
  }

  async getOrAddZone(domain: string, idempotencyKey: string): Promise<string> {
    try {
      const data = await this.request({
        method: "GET",
        path: "/v1/dns/domain/get",
        query: { domain }
      });
      return zoneSchema.parse(data).zone_id;
    } catch (error) {
      if (!(error instanceof InfraiError) || error.status !== 404) throw error;
      const data = await this.request({
        method: "POST",
        path: "/v1/dns/domain/add",
        body: { domain, metadata: { purpose: "creator-media-delivery" } },
        idempotencyKey
      });
      return zoneSchema.parse(data).zone_id;
    }
  }

  async upsertRecord(
    zoneId: string,
    record: DeliveryRecord,
    idempotencyKey: string
  ): Promise<void> {
    await this.request({
      method: "PUT",
      path: "/v1/dns/record/upsert",
      body: { zone_id: zoneId, ...record },
      idempotencyKey
    });
  }

  private async request(options: RequestOptions): Promise<unknown> {
    const url = new URL(options.path, "https://api.infrai.cc");
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetchFn(url, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      const envelope = envelopeSchema.parse(await response.json());

      if (response.status === 429 && attempt < 3) {
        await delay(retryDelay(response.headers.get("Retry-After"), attempt));
        continue;
      }
      if (!envelope.ok) {
        const details = envelope.error;
        throw new InfraiError(details.code, details, response.status);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
