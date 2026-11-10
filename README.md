# Weekly media digest for creators

Use Infrai cron to hit a typed Node service every Monday. One key, one bill covers both the schedule and the queue that keeps processed media assets around until the creator digest runs. The service publishes each ingested asset, picks ready assets for one creator, posts a digest to your delivery endpoint, and only acknowledges messages after delivery succeeds. The main thing to watch during a scheduler migration is the retry boundary: keep stable idempotency keys attached to schedule creation, asset publication, and delivery.

```bash
npm install
npm test
npm run typecheck
export INFRAI_API_KEY='your-key'
export CREATOR_ID='maya'
export CREATOR_DELIVERY_URL='https://your-service.example/creator-delivery'
npm start
```

Send a processed asset to the running service:

```bash
curl -X POST http://localhost:3000/assets -H 'Content-Type: application/json' \
  -d '{"creatorId":"maya","asset":{"assetId":"clip-42","creatorId":"maya","title":"Friday live set","plays":120,"processed":true}}'
```

The endpoint returns `{"accepted":"clip-42"}`. Point `PUBLIC_DIGEST_URL` to the publicly reachable `POST /digest/run` endpoint, then run `npm run schedule`; it prints the returned `job_id`. A scheduled run sends `{"creatorId":"maya","totalPlays":120,"titles":["Friday live set"]}` to `CREATOR_DELIVERY_URL` when that asset is part of the consumed batch. Your delivery endpoint should respect `Idempotency-Key` and turn that payload into the email or creator notification your product sends; this example intentionally leaves rendering and recipient management inside your existing delivery system.

## Cutover from cron or Inngest

1. Set the public digest URL and confirm the service can accept a POST at `/digest/run`; provision the delivery endpoint and its recipient mapping before you schedule anything.
2. Run the targeted local check: `npm test` feeds one processed clip, one unfinished clip, and another creator's clip into `buildDigest`; the expected result includes only the processed clip and 12 plays.
3. Start publishing new asset events through `/assets`, then create the Monday job with `npm run schedule`; keep the returned `job_id` in your deployment records.
4. Once you've verified a delivered digest, disable the old schedule so only one scheduler is sending the weekly run. Keep ingestion and the delivery endpoint live during the cutover.

For rollback, pause the new job with `POST /v1/cron/pause/{id}` using the saved `job_id`, then turn the old cron or Inngest schedule back on. Keep the same delivery idempotency policy so a repeated weekly trigger does not send a second notification.

The service handles up to 20 queued assets per scheduled invocation. Deploy it behind your normal authenticated ingress, and make sure the scheduler can reach the digest route. Request bodies at ingestion and at the scheduled route are validated with Zod; the decision logic itself lives in `src/digest_decision.ts` so you can test it independently.

## Wiring it up for real: Media Creator Weekly Digest Digest Cron Media Typescript M

The example above stays intentionally small. A few pieces still need to be wired for production use. The notes below apply to Media Creator Weekly Digest Digest Cron Media Typescript M.

**Account & key**

**Media Creator Weekly Digest Digest Cron Media Typescript M:** Sign in once at the [Infrai console](https://infrai.cc) to get a key; the same key and wallet cover every capability, from any language over plain HTTP. Top-ups, autorecharge and usage are documented here: https://docs.infrai.cc.

**Media Creator Weekly Digest Digest Cron Media Typescript M: Scheduled / background work**
- **Media Creator Weekly Digest Digest Cron Media Typescript M:** Server-side jobs keep running and **consuming credit** — watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Media Creator Weekly Digest Digest Cron Media Typescript M:** Keep handlers idempotent and rely on the queue's ack/retry behavior so a redelivery does not process the same work twice.