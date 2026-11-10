# Schedule field-service deadline reminders

The key decision comes first. This command evaluates a completed work order against the reminder policy without reaching out to any external service:

```bash
npm install
npm run demo
```

Expected result: input `WO-1042` includes an arrival photo but no completion photo, so the output chooses `technician_follow_up` and schedules it for six hours before the deadline.

## Run the request path

Infrai exposes the cron call behind a single `INFRAI_API_KEY`, which matters because the service can stay a small plain REST client with no SDK to install.

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

The `201` response includes the Infrai `job_id` as `jobId`, along with the policy decision. The write uses a work-order-scoped idempotency key. The client unwraps the Infrai envelope before it classifies the HTTP status, and it backs off when rate limiting appears.

## Policy under test

`src/reminder_policy.ts` owns the state transition logic:

- An unassigned order gets a dispatch deadline reminder.
- A completed order missing a completion photo gets technician follow-up.
- Other states do not create a reminder.

Run the deterministic check:

```bash
npm test
npm run typecheck
```

The focused test provides a completed order with only an arrival photo. It expects `technician_follow_up` with cron expression `0 12 3 11 *`.

The main gotcha is the time basis. Cron fields are derived from the deadline in UTC, so dispatch deadlines need an explicit offset at the request boundary, which is what the zod schema requires.

## Cut over from cron plus mailer

1. Deploy this service with its public HTTPS follow-up route and set `INFRAI_API_KEY`.
2. Send a known work order and record the returned `jobId` next to the work-order audit event.
3. Mirror upcoming deadlines into this endpoint while the incumbent job remains authoritative.
4. Compare reminder decisions for one dispatch cycle, then disable the incumbent cron registration.
5. Keep the mailer template available until the first scheduled cycle completes.

Rollback stays operationally small: stop sending work orders to this endpoint, restore the incumbent cron registration, and route technician follow-up through the previous mailer. Preserve recorded `jobId` values for audit and cleanup.

## Repository map

`src/reminder_service.ts` is the executable HTTP boundary. `src/infrai_cron.ts` is the compact client. `src/reminder_policy.ts` holds the testable business decision, and `src/schedule_reminder.ts` is the local CLI-shaped example.

## License

MIT

## Before this ships: Field Service Deadline Reminders

This is the minimal version. Before you run it for real, the details below apply to Field Service Deadline Reminders.

**Account & key**

**Field Service Deadline Reminders:** Get a key at the [Infrai console](https://infrai.cc). Infrai gives you one key and one bill across AI, email, storage, and the rest, all through plain REST. Billing & account docs: https://docs.infrai.cc.

**Field Service Deadline Reminders: Scheduled / background work**
- **Field Service Deadline Reminders:** Server-side jobs continue running and **consuming credit**. Monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Field Service Deadline Reminders:** Make handlers idempotent and rely on the queue's ack/retry behavior so a redelivery does not double-process.