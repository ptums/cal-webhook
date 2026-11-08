require("dotenv").config({ path: ".env.local" });
import { createHmac, createHash, timingSafeEqual } from "node:crypto";

function unauthorized401Response() {
  return new Response("unauthorized", {
    status: 401,
    headers: { "Content-Type": "text/plain" },
  });
}

function idFromBookingUid(uid: string): string {
  // Generate a deterministic 64-character SHA-256 hex string
  const hex = createHash("sha256").update(uid).digest("hex");

  // Extract each segment of the first 32 characters
  const p1 = hex.slice(0, 8);
  const p2 = hex.slice(8, 12);
  const p3 = hex.slice(12, 16);
  const p4 = hex.slice(16, 20);
  const p5 = hex.slice(20, 32);

  // Combine them into an 8-4-4-4-12 string format
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
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
    const id = idFromBookingUid(results.payload.uid)
    try {
      const posthogResponse = await fetch(
        `${process.env.POSTHOG_HOST}/i/v0/e/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: process.env.POSTHOG_API_KEY,
            event: triggerEvent.toLowerCase(),
            id: crypto.randomUUID(),
            uuid: id,
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
