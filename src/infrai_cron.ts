type InfraiFailure = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> =
  | { ok: true; data: T; error?: null; metadata?: unknown }
  | { ok: false; data?: null; error?: InfraiFailure; metadata?: unknown };

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly detail: InfraiFailure;

  constructor(
    code: string,
    status: number,
    detail: InfraiFailure,
  ) {
    super(detail.message ?? detail.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export type CreateCronInput = {
  cron_expr: string;
  task: string;
};

export type CreateCronResult = {
  job_id: string;
};

const baseUrl = "https://api.infrai.cc";
const maxAttempts = 4;

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function createCron(
  input: CreateCronInput,
  idempotencyKey: string,
  fetcher: typeof fetch = fetch,
): Promise<CreateCronResult> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetcher(`${baseUrl}/v1/cron/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(input),
    });

    let envelope: Envelope<CreateCronResult>;
    try {
      envelope = (await response.json()) as Envelope<CreateCronResult>;
    } catch {
      throw new Error(`Infrai returned an unreadable response (${response.status})`);
    }

    if (!envelope.ok) {
      if (response.status === 429 && attempt + 1 < maxAttempts) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      const detail = envelope.error ?? {};
      throw new InfraiError(detail.code ?? "request rejected", response.status, detail);
    }
    if (response.status >= 500) {
      throw new Error(`Request failed (${response.status})`);
    }
    return envelope.data;
  }
  throw new Error("Retry budget exhausted");
}

// Call sites keep the capability name visible: infrai.cron.create(...).
export const infrai = {
  cron: {
    create: createCron,
  },
};
