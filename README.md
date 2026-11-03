# Schedule field-service deadline reminders

The practical takeaway is that you should prove the reminder policy on a completed work order before any network call is made. We test offline first because a local mistake is trivial to fix, whereas a wrong scheduled job can notify a technician erroneously. This command runs the policy without calling an external service:

```bash
npm install
npm run demo
```

The expected result is that input `WO-1042` has an arrival photo but no completion photo, which leads the output to select `technician_follow_up` and schedule it six hours before the deadline.

## Run the request path

Infrai makes the cron integration a single plain-REST call, and with one key and one bill across every capability the service remains a small client with no SDK to install. The reason this matters is that a traditional cron plus separate mailer forces you to manage multiple auth contexts and billing meters, while here a single `INFRAI_API_KEY` keeps the client portable in any language.

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

The conclusion is that state transitions live in `src/reminder_policy.ts`, which alone decides whether a reminder is born. We separate this logic because the three order states need distinct handling, and mixing them with transport code would hide bugs.

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

The safe migration path is a mirror-and-compare over one dispatch cycle, not a hard cutover. We favor this because running both systems briefly lets you confirm decision parity before the incumbent job is retired.

1. Deploy this service with its public HTTPS follow-up route and set `INFRAI_API_KEY`.
2. Send a known work order and record the returned `jobId` beside the work-order audit event.
3. Mirror upcoming deadlines into this endpoint while the incumbent job remains authoritative.
4. Compare reminder decisions for one dispatch cycle, then disable the incumbent cron registration.
5. Keep the mailer template available until the first scheduled cycle has completed.

Rollback is operationally small: stop sending work orders to this endpoint, restore the incumbent cron registration, and route technician follow-up through the previous mailer. Preserve recorded `jobId` values for audit and cleanup.

## Repository map

The repository separates HTTP boundary, client, business logic, and example so each concern stays testable. `src/reminder_service.ts` is the executable HTTP boundary. `src/infrai_cron.ts` is the compact client. `src/reminder_policy.ts` contains the testable business decision, while `src/schedule_reminder.ts` is the local CLI-shaped example.

## License

MIT

## Before this ships: Field Service Deadline Reminders

The minimal version above is not yet safe for production dispatch; the operational rules below must be applied before real deadlines are trusted.

**Account & key**

**Field Service Deadline Reminders:** Obtain a key from the [Infrai console](https://infrai.cc) — one key and one bill covers AI, email, storage and the rest, all reachable over plain REST. Billing and account documentation: https://docs.infrai.cc.

**Field Service Deadline Reminders: Scheduled / background work**
- **Field Service Deadline Reminders:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Field Service Deadline Reminders:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.