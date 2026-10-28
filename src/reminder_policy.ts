import { z } from "zod";

export const workOrderSchema = z.object({
  workOrderId: z.string().min(1),
  dispatchStatus: z.enum(["unassigned", "dispatched", "on_site", "completed"]),
  deadline: z.string().datetime({ offset: true }),
  technician: z.object({
    id: z.string().min(1),
    followUpUrl: z.string().url(),
  }),
  photos: z.array(
    z.object({
      id: z.string().min(1),
      kind: z.enum(["arrival", "completion"]),
      capturedAt: z.string().datetime({ offset: true }),
    }),
  ),
});

export type WorkOrder = z.infer<typeof workOrderSchema>;

export type ReminderDecision = {
  kind: "dispatch_deadline" | "technician_follow_up" | "none";
  cronExpr: string | null;
  reason: string;
};

export function decideReminder(workOrder: WorkOrder): ReminderDecision {
  const deadline = new Date(workOrder.deadline);
  const minute = deadline.getUTCMinutes();
  const hour = deadline.getUTCHours();
  const day = deadline.getUTCDate();
  const month = deadline.getUTCMonth() + 1;
  const sixHoursBefore = new Date(deadline.getTime() - 6 * 60 * 60 * 1_000);
  const schedule = `${sixHoursBefore.getUTCMinutes()} ${sixHoursBefore.getUTCHours()} ${sixHoursBefore.getUTCDate()} ${sixHoursBefore.getUTCMonth() + 1} *`;

  if (workOrder.dispatchStatus === "unassigned") {
    return {
      kind: "dispatch_deadline",
      cronExpr: schedule,
      reason: `Work order is unassigned; remind dispatch six hours before ${day}/${month} at ${hour}:${minute.toString().padStart(2, "0")} UTC.`,
    };
  }

  const hasCompletionPhoto = workOrder.photos.some((photo) => photo.kind === "completion");
  if (workOrder.dispatchStatus === "completed" && !hasCompletionPhoto) {
    return {
      kind: "technician_follow_up",
      cronExpr: schedule,
      reason: "Completed work order has no completion photo; request technician follow-up.",
    };
  }

  return {
    kind: "none",
    cronExpr: null,
    reason: "No deadline reminder is required for the current work-order state.",
  };
}
