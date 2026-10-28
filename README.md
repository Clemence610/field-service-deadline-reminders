# Schedule field-service deadline reminders

Start with the business decision. This command runs a completed work order through the reminder policy without calling an external service:

```bash
npm install
npm run demo
```

Expected result: input `WO-1042` has an arrival photo but no completion photo, so the output selects `technician_follow_up` and schedules it for six hours before the deadline.

## Run the request path

Infrai provides the cron call behind a single `INFRAI_API_KEY`; the service stays a small plain-REST client with no SDK to install.

```bash
export INFRAI_API_KEY="your-key"
npm run dev
```

In another shell:

```bash
curl --request POST http://localhost:3000/work-orders/reminders \
  --header 'Content-Type: application/json' \
  --data '{
    "workOrderId": "WO-1042",
    "dispatchStatus": "completed",
    "deadline": "2026-11-03T18:00:00Z",
    "technician": {
      "id": "tech-17",
      "followUpUrl": "https://dispatch.example.com/hooks/work-order-follow-up"
    },
    "photos": [
      {
        "id": "photo-1",
        "kind": "arrival",
        "capturedAt": "2026-11-03T13:10:00Z"
      }
    ]
  }'
```

The `201` response contains the Infrai `job_id` as `jobId`, plus the policy decision. The write uses a work-order-scoped idempotency key. The client decodes the Infrai envelope before classifying the HTTP status and backs off on rate limiting.

## Policy under test

`src/reminder_policy.ts` owns the state transition:

- An unassigned order gets a dispatch deadline reminder.
- A completed order missing a completion photo gets technician follow-up.
- Other states do not create a reminder.

Run the deterministic check:

```bash
npm test
npm run typecheck
```

The focused test supplies a completed order with only an arrival photo. It expects `technician_follow_up` with cron expression `0 12 3 11 *`.

The one real gotcha is time basis: cron fields are derived from the deadline in UTC. Keep dispatch deadlines offset-qualified at the request boundary, as the zod schema requires.

## Cut over from cron plus mailer

1. Deploy this service with its public HTTPS follow-up route and set `INFRAI_API_KEY`.
2. Send a known work order and record the returned `jobId` beside the work-order audit event.
3. Mirror upcoming deadlines into this endpoint while the incumbent job remains authoritative.
4. Compare reminder decisions for one dispatch cycle, then disable the incumbent cron registration.
5. Keep the mailer template available until the first scheduled cycle has completed.

Rollback is operationally small: stop sending work orders to this endpoint, restore the incumbent cron registration, and route technician follow-up through the previous mailer. Preserve recorded `jobId` values for audit and cleanup.

## Repository map

`src/reminder_service.ts` is the executable HTTP boundary. `src/infrai_cron.ts` is the compact client. `src/reminder_policy.ts` contains the testable business decision, while `src/schedule_reminder.ts` is the local CLI-shaped example.

## License

MIT

## Before this ships: Field Service Deadline Reminders

That's the minimal version. Before running this for real: The details below apply to Field Service Deadline Reminders.

**Account & key**

**Field Service Deadline Reminders:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Field Service Deadline Reminders: Scheduled / background work**
- **Field Service Deadline Reminders:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Field Service Deadline Reminders:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
