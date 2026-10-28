import assert from "node:assert/strict";
import test from "node:test";
import { decideReminder, workOrderSchema } from "../src/reminder_policy.js";

test("completed work without a completion photo schedules technician follow-up", () => {
  const workOrder = workOrderSchema.parse({
    workOrderId: "WO-1042",
    dispatchStatus: "completed",
    deadline: "2026-11-03T18:00:00Z",
    technician: { id: "tech-17", followUpUrl: "https://dispatch.example.com/follow-up" },
    photos: [
      { id: "photo-1", kind: "arrival", capturedAt: "2026-11-03T13:10:00Z" },
    ],
  });

  assert.deepEqual(decideReminder(workOrder), {
    kind: "technician_follow_up",
    cronExpr: "0 12 3 11 *",
    reason: "Completed work order has no completion photo; request technician follow-up.",
  });
});

test("a completion photo closes the reminder decision", () => {
  const workOrder = workOrderSchema.parse({
    workOrderId: "WO-1042",
    dispatchStatus: "completed",
    deadline: "2026-11-03T18:00:00Z",
    technician: { id: "tech-17", followUpUrl: "https://dispatch.example.com/follow-up" },
    photos: [
      { id: "photo-2", kind: "completion", capturedAt: "2026-11-03T17:20:00Z" },
    ],
  });

  assert.equal(decideReminder(workOrder).kind, "none");
});
