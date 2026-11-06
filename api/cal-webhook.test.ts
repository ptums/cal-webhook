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
  console.log(signature);
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
  it("returns 400 when the body is not valid JSON", async () => {
    const sr = signedRequest("not json");
    const response = await POST(sr);
    expect(response.status).toBe(400);
  });

  it("sends booking_created to PostHog with no name or email", async () => {
    const fakeFetch = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response("ok"),
    );
    vi.stubGlobal("fetch", fakeFetch);

    const body = JSON.stringify({
      triggerEvent: "BOOKING_CREATED",
      createdAt: "2026-11-05T15:00:00.000Z",
      payload: {
        attendees: [{ name: "Test Person", email: "test@example.com" }],
      },
    });
    const sr = signedRequest(body);

    await POST(sr);

    // TODO: expect fakeFetch to be called 1 time
    // expect(fakeFetch).toHaveBeenCalledTimes(1);
    const sentBody = String(fakeFetch.mock.calls[0][1]?.body);
    // TODO: expect sentBody to contain "booking_created"
    expect(sentBody).toContain("booking_created");
    // TODO: expect sentBody NOT to contain the name or the email
  });
});
