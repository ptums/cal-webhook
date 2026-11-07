require("dotenv").config({ path: ".env.local" });
import { createHmac, timingSafeEqual } from "node:crypto";

function unauthorized401Response() {
  return new Response("unauthorized", {
    status: 401,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(request: Request) {
  // 1. Extract the incoming signature header
  const signature = request.headers.get("x-cal-signature-256");

  if (!signature) return unauthorized401Response();

  // 2. Check if secret exists
  const secret = process.env.CAL_WEBHOOK_SECRET;

  if (!secret) return unauthorized401Response();

  // 3. Get the raw request body text (crucial for HMAC calculation)
  const rawBody = await request.text();

  // 4. Compute your own HMAC as a hex string
  const computedHex = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  // 4. Convert both strings to Buffers for timingSafeEqual
  const signatureBuffer = Buffer.from(signature, "utf8");
  const computedBuffer = Buffer.from(computedHex, "utf8");

  // 5. Check lengths first to avoid throwing an error in timingSafeEqual
  if (signatureBuffer.length !== computedBuffer.length)
    return unauthorized401Response();

  // 6. Use timingSafeEqual to prevent timing attacks
  const isValid = timingSafeEqual(signatureBuffer, computedBuffer);

  if (!isValid) return unauthorized401Response();

  let results;
  try {
    results = JSON.parse(rawBody);
  } catch {
    return new Response("bad request", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (results.triggerEvent === "BOOKING_CREATED") {
    const { triggerEvent, createdAt } = results;
    try {
      const posthogResponse = await fetch(
        `${process.env.POSTHOG_HOST}/i/v0/e/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: process.env.POSTHOG_API_KEY,
            event: triggerEvent.toLowerCase(),
            distinct_id: crypto.randomUUID(),
            timestamp: createdAt,
            properties: {
              $process_person_profile: false,
            },
          }),
        },
      );

      if (posthogResponse?.ok) {
        return new Response("ok", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }

      return new Response("upstream error", {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      });
    } catch {
      return new Response("upstream error", {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      });
    }
  }

  return new Response("ok", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}
