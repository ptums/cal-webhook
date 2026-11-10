# 1. The webhook lives in its own repo

Date: 2026-10-26
Status: Accepted

## Context

When someone books time with me on Cal.com from my personal site, tumulty.me, I needed a way to capture the booking as an event in PostHog analytics. Without it, PostHog only sees the click on "Book an intro call", and the funnel stops there.

I could have put this function inside the site repo, or in a separate repo.

## Decision

The webhook is a standalone Vercel Function in its own public repo, `cal-webhook`.

## Why

- By design, the work this service does is between Cal.com and PostHog. The site isn't in that path, so it didn't make sense to build it into the site.
- When I need to make a change here, I don't have to commit to the production site.
- I want to keep the personal site lightweight and static.

## Costs

- I now manage 2 code repositories, and 1 more Vercel project with its own env vars.
- In return, if this service grows to work with other services, it can scale on its own and isn't tangled up with the personal site.
