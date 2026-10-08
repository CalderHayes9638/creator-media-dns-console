import { createServer, type ServerResponse } from "node:http";
import { InfraiDnsClient, InfraiError } from "./infrai_dns.js";
import {
  AssetNotReadyError,
  publishCreatorAsset,
  publishRequestSchema
} from "./media_delivery.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const dns = new InfraiDnsClient(apiKey);
const port = Number(process.env.PORT ?? 3000);

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/media/delivery") {
    return json(response, 404, { error: "Route not found" });
  }

  try {
    const input = publishRequestSchema.parse(await readJson(request));
    const result = await publishCreatorAsset(dns, input);
    return json(response, 201, result);
  } catch (error) {
    if (error instanceof AssetNotReadyError) {
      return json(response, error.status, {
        error: "asset_not_ready",
        processing_status: error.processingStatus
      });
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return json(response, status, { error: error.code, details: error.details });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return json(response, 400, { error: "invalid_request" });
    }
    return json(response, 500, { error: "internal_error" });
  }
}).listen(port, () => {
  console.log(`Media delivery admin listening on http://localhost:${port}`);
});

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
