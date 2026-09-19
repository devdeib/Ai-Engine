# Pilot drain scheduler

Vercel Hobby cron jobs may run **once per day**. A once-daily schedule is too
slow for 5–15s AI/delivery retries and 90s lease reclaim, and a sub-daily
`vercel.json` cron will **fail Hobby deploys**. Do not add a paid Vercel Cron
plan for this.

The application already processes due work here:

- `GET` or `POST` `/api/v1/internal/ai-jobs/drain`
- Auth: `Authorization: Bearer <CRON_SECRET>`
- That route drains **AI jobs and channel deliveries**
- `/api/v1/internal/channel-deliveries/drain` is the deliveries-only twin

The scheduler must only **wake** those routes. It is not a second job system.
Existing unique indexes still prevent duplicate AI jobs, duplicate AI replies,
and duplicate delivery enqueue.

## Production setup (free HTTP cron)

1. Set `CRON_SECRET` in the Vercel project (random string, 16+ characters).
2. Confirm `NEXT_PUBLIC_APP_URL` is the public production origin.
3. Create a **1-minute** job in a free HTTP cron service (for example
   [cron-job.org](https://cron-job.org)):
   - URL: `https://<NEXT_PUBLIC_APP_URL>/api/v1/internal/ai-jobs/drain`
   - Method: `GET`
   - Header: `Authorization: Bearer <CRON_SECRET>`
   - Interval: every 1 minute
4. Unauthorized calls must continue to return 401. Do not omit the header.

Example:

```http
GET /api/v1/internal/ai-jobs/drain HTTP/1.1
Host: <production-host>
Authorization: Bearer <CRON_SECRET>
```

Inbound webhooks still process via `after()`. This scheduler only recovers
retries, lease reclaim, and a missed nested `after()` without waiting for
another customer message.
