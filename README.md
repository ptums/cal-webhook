# cal-webhook

When someone books a call with me on Cal.com from [tumulty.me](https://tumulty.me), this small service tells PostHog that a call was booked. That closes the gap in my analytics: PostHog could see the click on "Book an intro call", but not the booking itself.

It sends **no name, no email and no location**. Only the event, the time and a booking ID.

## How it works

```text
Cal.com  --(signed POST)-->  /api/cal-webhook  --(event)-->  PostHog
```

1. Cal.com sends a `BOOKING_CREATED` webhook, signed with a shared secret.
2. The function checks the signature (HMAC SHA-256). A missing or wrong signature gets `401`.
3. It sends 1 `booking_created` event to PostHog.
4. It replies `200` when PostHog accepts the event, or `502` when PostHog fails, so Cal.com retries.

Other Cal.com events get a plain `200` and nothing is sent.

## Design choices

- **Privacy first.** The event has `$process_person_profile: false` and `$geoip_disable: true`, so PostHog makes no person profile and adds no city.
- **No duplicates.** Cal.com can send the same booking more than once. The event `uuid` and `distinct_id` are a SHA-256 hash of the booking `uid`, so a repeat has the same ID and PostHog drops it.
- **Its own repo.** The work happens between Cal.com and PostHog, so the site isn't in the path. See [ADR 1](docs/adr/0001-standalone-repo.md).

## Run it locally

You need Node 20 or later, pnpm and the Vercel CLI.

```bash
pnpm install
```

Make a `.env.local` file (it is git-ignored):

```text
CAL_WEBHOOK_SECRET=[a long random value]
POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_API_KEY=[your phc_ project key]
```

Start the function:

```bash
vercel dev
```

Send test requests in a second terminal:

```bash
./scripts/send-test.sh valid
```

The modes are `valid`, `nosig`, `badsig` and `tampered`. Only `valid` should get past the signature check.

## Tests

```bash
pnpm test
```

The tests use Vitest and a fake `fetch`, so they never call PostHog. They cover bad JSON, the signature path, no personal data, GeoIP off, duplicate IDs and PostHog failures.

## Deploy

The project is on Vercel. A push to `main` deploys to production. Set the same 3 env vars in the Vercel project. Only `CAL_WEBHOOK_SECRET` is a secret; the PostHog key is a public project key.

Then in Cal.com, go to **Settings → Developer → Webhooks**, and add:

- Subscriber URL: `https://[your-project].vercel.app/api/cal-webhook`
- Secret: the same value as `CAL_WEBHOOK_SECRET`
- Trigger: **Booking Created**
