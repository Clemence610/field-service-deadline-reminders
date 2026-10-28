import { decideReminder, workOrderSchema } from "./reminder_policy.js";

const workOrder = workOrderSchema.parse({
  workOrderId: "WO-1042",
  dispatchStatus: "completed",
  deadline: "2026-11-03T18:00:00Z",
  technician: {
    id: "tech-17",
    followUpUrl: "https://dispatch.example.com/hooks/work-order-follow-up",
  },
  photos: [
    { id: "photo-1", kind: "arrival", capturedAt: "2026-11-03T13:10:00Z" },
  ],
});

console.log(JSON.stringify(decideReminder(workOrder), null, 2));
