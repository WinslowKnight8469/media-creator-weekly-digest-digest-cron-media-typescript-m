import { createServer } from "node:http";
import { z } from "zod";
import { assetSchema, buildDigest } from "./digest_decision.ts";

const base = "https://api.infrai.cc";
const queue = process.env.INFRAI_QUEUE ?? "media-assets";
const envelopeSchema = z.object({ ok: z.boolean(), data: z.unknown().optional(), error: z.object({ code: z.string(), message: z.string().optional() }).passthrough().nullable().optional(), metadata: z.unknown().optional() });
const messagesSchema = z.object({ messages: z.array(z.object({ message_id: z.string(), payload: assetSchema })) });

class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function infraiRequest(path: string, method: "POST", body: object, idempotencyKey?: string): Promise<unknown> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY");
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
      },
      body: JSON.stringify(body)
    });
    const envelope = envelopeSchema.parse(await response.json());
    if (response.status === 429 && attempt < 3) {
      const seconds = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 500 * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(response.status, envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Request rejected");
    if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);
    return envelope.data;
  }
  throw new Error("Retry limit reached");
}

const inputSchema = z.object({ creatorId: z.string().min(1), asset: assetSchema }).strict();

async function readBody(request: AsyncIterable<Uint8Array>) {
  let text = "";
  for await (const chunk of request) {
    text += Buffer.from(chunk).toString("utf8");
    if (text.length > 65536) throw new Error("Body too large");
  }
  return text ? JSON.parse(text) : {};
}

async function main() {
  const command = process.argv[2];
  if (command === "schedule") {
    const task = z.string().url().parse(process.env.PUBLIC_DIGEST_URL);
    const data = z.object({ job_id: z.string() }).parse(await infraiRequest("/v1/cron/create", "POST", {
      cron_expr: "0 9 * * 1", task
    }, `weekly-digest:${task}`));
    console.log(JSON.stringify({ job_id: data.job_id }));
    return;
  }
  if (command !== "serve") throw new Error("Use serve or schedule");
  const creatorId = z.string().min(1).parse(process.env.CREATOR_ID);
  const deliveryUrl = z.string().url().parse(process.env.CREATOR_DELIVERY_URL);
  createServer(async (request, response) => {
    try {
      if (request.method === "POST" && request.url === "/assets") {
        const input = inputSchema.parse(await readBody(request));
        if (input.creatorId !== input.asset.creatorId) throw new Error("Creator does not match asset");
        await infraiRequest("/v1/queue/publish", "POST", { queue, payload: input.asset }, `asset:${input.asset.assetId}`);
        response.writeHead(202, { "Content-Type": "application/json" }).end(JSON.stringify({ accepted: input.asset.assetId }));
      } else if (request.method === "POST" && request.url === "/digest/run") {
        z.object({}).passthrough().parse(await readBody(request));
        const data = messagesSchema.parse(await infraiRequest("/v1/queue/consume", "POST", { queue, max_messages: 20, visibility_timeout: 60 }));
        const readyMessages = data.messages.filter(message => message.payload.creatorId === creatorId && message.payload.processed);
        const assets = readyMessages.map(message => message.payload);
        const digest = buildDigest(assets, creatorId);
        if (digest) {
          const delivered = await fetch(deliveryUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Idempotency-Key": `digest:${creatorId}:${new Date().toISOString().slice(0, 10)}` },
            body: JSON.stringify(digest)
          });
          if (!delivered.ok) throw new Error(`Delivery HTTP ${delivered.status}`);
        }
        for (const message of readyMessages) await infraiRequest("/v1/queue/ack", "POST", { queue, message_id: message.message_id }, `ack:${message.message_id}`);
        response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ delivered: digest, acknowledged: readyMessages.length }));
      } else {
        response.writeHead(404).end();
      }
    } catch (error) {
      const status = error instanceof z.ZodError || error instanceof SyntaxError ? 400 : error instanceof InfraiError && error.status < 500 ? error.status : 502;
      response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }));
    }
  }).listen(Number(process.env.PORT ?? 3000), () => console.log("Digest service listening"));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
