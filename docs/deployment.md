# Deployment checklist

## Supabase

- Create a project.
- Run `supabase link` and `supabase db push` to apply `supabase/migrations`.
- Check the three storage buckets exist and are private.
- Auth settings: set the site URL, add `/auth/callback` and `/auth/confirm` as redirect URLs, require email confirmation, and configure the Google provider.
- Keep the service role key out of anything that ships to a browser.

## API and worker

- Build the images from `docker/api.Dockerfile` and `docker/worker.Dockerfile`.
- Set a long random `REDIS_PASSWORD` and keep Redis off the public internet. Jobs on the queue are Python pickles, so anyone who can write to Redis can run code on the worker.
- Give both the same `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `REDIS_URL`. Both also need `SUPABASE_ANON_KEY`. The API also needs `WEB_ORIGIN`.
- Run one or more worker containers. The worker listens to the `separation`, `adjust` and `mix` queues. Add `DEMUCS_DEVICE=cuda` on GPU hosts. Run one `cleanup` container.
- Set the same `INTERNAL_API_SECRET` on the API and the web app so the public forms are rate limited per real visitor.
- Put the API behind HTTPS. Only the web server needs to reach it, so keep it off the public internet if you can.
- Point a health check at `GET /health`. It returns 503 if the database or Redis is down.

## Admin access

Sign up normally, then make yourself an admin with SQL in the Supabase SQL editor:

```sql
update public.profiles set is_admin = true where email = 'you@example.com';
```

An Admin link then appears in the dashboard sidebar.

## Email and analytics (optional)

- Set `RESEND_API_KEY`, `EMAIL_FROM` (a sender on a domain you verified in Resend) and `SITE_URL` on the API and worker to send finished-job emails.
- Set `NEXT_PUBLIC_ANALYTICS_DOMAIN` on the web app to load cookieless analytics on the public pages.

## Web

- Deploy `apps/web` to Vercel. Set the `NEXT_PUBLIC_*` variables and `API_URL`.
- Set `NEXT_PUBLIC_SITE_URL` to the final domain so canonical URLs, the sitemap and social previews are right.
- Submit `/sitemap.xml` to Google Search Console.

## Before you launch

- Get the privacy policy, terms and copyright pages reviewed by a lawyer.
- Decide who answers copyright reports and how you will action them. Reports land in the `copyright_reports` table.
- Set `NEXT_PUBLIC_SUPPORT_EMAIL`.
- Test the real flow once end to end in the deployed environment: sign up, upload, process, play, delete.
