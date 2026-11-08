import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { POST } from "./cal-webhook";

const CAL_WEBHOOK_SECRET = "test-secret";
process.env.CAL_WEBHOOK_SECRET = CAL_WEBHOOK_SECRET;

// Step 4: the helper
function signedRequest(body: string): Request {
  const signature = createHmac("sha256", CAL_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  return new Request("http://localhost/api/cal-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cal-signature-256": signature,
    },
    body,
  });
}

// Step 5: the test
describe("POST /api/cal-webhook", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("1. returns 400 when the body is not valid JSON", async () => {
    const sr = signedRequest("not json");
    const response = await POST(sr);
    expect(response.status).toBe(400);
  });

  it("2. sends booking_created to PostHog with no name or email", async () => {
    const fakeFetch = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response("ok"),
    );
    vi.stubGlobal("fetch", fakeFetch);

    const body = JSON.stringify({
      triggerEvent: "BOOKING_CREATED",
      createdAt: "2026-11-05T15:00:00.000Z",
      payload: {
        uid: "booking-1",
        attendees: [{ name: "Test Person", email: "test@example.com" }],
      },
    });
    const sr = signedRequest(body);

    await POST(sr);

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const sentBody = String(fakeFetch.mock.calls[0][1]?.body);
    expect(sentBody).toContain("booking_created");
    expect(sentBody).not.toContain("Test Person");
    expect(sentBody).not.toContain("test@example.com");
    expect(sentBody).toContain("2026-11-05T15:00:00.000Z");

    const sent = JSON.parse(sentBody);
    expect(sent.properties.$process_person_profile).toBe(false);

    expect(sent.properties.$geoip_disable).toBe(true);
  });

  it("3. sends a different distinct_id for each booking", async () => {
    const fakeFetch = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response("ok"),
    );
    vi.stubGlobal("fetch", fakeFetch);

    const body1 = JSON.stringify({
      triggerEvent: "BOOKING_CREATED",
      createdAt: "2026-11-05T15:00:00.000Z",
      payload: {
        uid: "booking-1",
        attendees: [{ name: "Test Person", email: "test@example.com" }],
      },
    });

    const body2 = JSON.stringify({
         triggerEvent: "BOOKING_CREATED",
         createdAt: "2026-11-05T15:00:00.000Z",
         payload: {
           
           uid: "booking-2",
           attendees: [{ name: "Test Person", email: "test@example.com" }],
         },
       });
    const sr1 = signedRequest(body1);
    const sr2 = signedRequest(body2);

    await POST(sr1);
    await POST(sr2);

    expect(fakeFetch).toHaveBeenCalledTimes(2);
    const sentBody1 = String(fakeFetch.mock.calls[0][1]?.body);
    const sentBody2 = String(fakeFetch.mock.calls[1][1]?.body);

    const sent1 = JSON.parse(sentBody1);
    const sent2 = JSON.parse(sentBody2);

    expect(sent1.distinct_id).toBeDefined();
    expect(sent1.distinct_id).not.toBe(sent2.distinct_id);
  });

  it("4. returns 502 when PostHog fails, so Cal.com retries", async () => {
    const fakeFetch = vi.fn(async (_url: string, _init?: RequestInit) => {
      return new Response("error", { status: 500 });
    });
    vi.stubGlobal("fetch", fakeFetch);

    const body = JSON.stringify({
      triggerEvent: "BOOKING_CREATED",
      createdAt: "2026-11-05T15:00:00.000Z",
      payload: {
        uid: "booking-1",
        attendees: [{ name: "Test Person", email: "test@example.com" }],
      },
    });
    const sr = signedRequest(body);

    const response = await POST(sr);
    expect(response.status).toBe(502);
  });

  it("5. returns 502 when PostHog can't be reached", async () => {
    const fakeFetch = vi.fn(async (_url: string, _init?: RequestInit) => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fakeFetch);

    const body = JSON.stringify({
      triggerEvent: "BOOKING_CREATED",
      createdAt: "2026-11-05T15:00:00.000Z",
      payload: {
        uid: "booking-1",
        attendees: [{ name: "Test Person", email: "test@example.com" }],
      },
    });
    const sr = signedRequest(body);

    const response = await POST(sr);
    expect(response.status).toBe(502);
  });

  it("6. sends the same uuid and distinct_id when a booking arrives twice", async () => {
    // TODO: stub fetch, the same as test 3
    const fakeFetch = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response("ok"),
    );
    vi.stubGlobal("fetch", fakeFetch);

    const body = JSON.stringify({
      triggerEvent: "BOOKING_CREATED",
      createdAt: "2026-11-05T15:00:00.000Z",
      payload: {
        uid: "booking-1",
        attendees: [{ name: "Test Person", email: "test@example.com" }],
      },
    });


    const sr1 = signedRequest(body);
    const sr2 = signedRequest(body);

    await POST(sr1);
    await POST(sr2);

    expect(fakeFetch).toHaveBeenCalledTimes(2);
    const sentBody1 = String(fakeFetch.mock.calls[0][1]?.body);
    const sentBody2 = String(fakeFetch.mock.calls[1][1]?.body);

    const sent1 = JSON.parse(sentBody1);
    const sent2 = JSON.parse(sentBody2);

    expect(sent1.uuid).toBeDefined();
    expect(sent1.uuid).toBe(sent2.uuid);
    expect(sent1.distinct_id).toBe(sent2.distinct_id);
   
    // TODO: 1 body with uid "booking-1", signed 2 times, POST both
    // TODO: parse both sent bodies
    // TODO: expect sent1.uuid toBe sent2.uuid
    // TODO: expect sent1.distinct_id toBe sent2.distinct_id
  });
});
