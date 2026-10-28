import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { InfraiError, infrai } from "./infrai_cron.js";
import { decideReminder, workOrderSchema } from "./reminder_policy.js";

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Buffer>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/work-orders/reminders") {
    send(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const workOrder = workOrderSchema.parse(await readJson(request));
    const decision = decideReminder(workOrder);
    if (!decision.cronExpr) {
      send(response, 200, { workOrderId: workOrder.workOrderId, decision });
      return;
    }

    const job = await infrai.cron.create(
      { cron_expr: decision.cronExpr, task: workOrder.technician.followUpUrl },
      `work-order:${workOrder.workOrderId}:${decision.kind}`,
    );
    send(response, 201, {
      workOrderId: workOrder.workOrderId,
      jobId: job.job_id,
      decision,
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "Invalid work-order request" });
      return;
    }
    if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
      send(response, error.status, { error: error.code, message: error.message });
      return;
    }
    send(response, 500, { error: "Unable to schedule reminder" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`reminder service listening on http://localhost:${port}`));
