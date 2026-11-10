require("dotenv").config({ path: ".env.local", quiet: true });
import { createHmac, createHash, timingSafeEqual } from "node:crypto";

function textResponse(body: string, status: number) {
  return new Response(body, {
    status,
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

  if (!signature) {
    return textResponse("unauthorized", 401);
  }

  // 2. Check if secret exists
  const secret = process.env.CAL_WEBHOOK_SECRET;

  if (!secret) {
    return textResponse("unauthorized", 401);
  }

  // 3. Get the raw request body text (crucial for HMAC calculation)
  const rawBody = await request.text();

  // 4. Compute your own HMAC as a hex string
  const computedHex = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  // 5. Convert both strings to Buffers for timingSafeEqual
  const signatureBuffer = Buffer.from(signature, "utf8");
  const computedBuffer = Buffer.from(computedHex, "utf8");

  // 6. Check lengths first to avoid throwing an error in timingSafeEqual
  if (signatureBuffer.length !== computedBuffer.length) {
    return textResponse("unauthorized", 401);
  }

  // 7. Use timingSafeEqual to prevent timing attacks
  if (!timingSafeEqual(signatureBuffer, computedBuffer)) {
    return textResponse("unauthorized", 401);
  }

  let results;
  try {
    results = JSON.parse(rawBody);
  } catch {
    return textResponse("bad request", 400);
  }

  // Only bookings go to PostHog. Other Cal.com events get a plain 200.
  if (results.triggerEvent !== "BOOKING_CREATED") {
    return textResponse("ok", 200);
  }

  const { triggerEvent, createdAt } = results;
  const id = idFromBookingUid(results.payload.uid);

  try {
    const posthogResponse = await fetch(`${process.env.POSTHOG_HOST}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.POSTHOG_API_KEY,
        event: triggerEvent.toLowerCase(),
        uuid: id,
        distinct_id: id,
        timestamp: createdAt,
        properties: {
          $process_person_profile: false,
          $geoip_disable: true,
        },
      }),
    });

    if (posthogResponse.ok) {
      return textResponse("ok", 200);
    }

    return textResponse("upstream error", 502);
  } catch {
    return textResponse("upstream error", 502);
  }
}
