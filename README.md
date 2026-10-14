# Karaoki

Your Music. Your Voice. Your Stage.

Karaoki is a free karaoke studio that runs in the browser. You upload a song you have the rights to, an AI model (Demucs) splits it into vocals and instrumental, and you sing along with the instrumental. Everything stays in your own private library.

This repo is the whole thing: the website, the API, the background worker and the database.

## What works right now

Everything below is built. The automated tests cover the code paths listed under Tests. A few things could not be run here (see Not tested).

- Landing page and the public pages (features, how it works, FAQ, contact form, privacy, terms, copyright)
- Four tool pages (AI karaoke maker, vocal remover, MP3 to karaoke, pitch changer) and a blog with three guides
- Sign up, log in, Google sign in, email verification, password reset
- Dashboard with usage, storage and recent songs
- Upload with drag and drop, progress, retries and a rights confirmation
- Real vocal separation with Demucs, running in a background worker with real progress
- Karaoki player: waveform, seek, volume, speed, instrumental / vocals / original (one at a time), downloads, keyboard shortcuts that can be switched off
- Key and tempo: change the key in semitones and the tempo independently, preview 30 seconds, export the full track
- Lyrics: paste lyrics or import a timestamped .lrc file, synced highlighting, auto-scroll, full screen, timing offset and a stamp tool
- Recording studio: record over the instrumental in the browser, adjust sync and volume, mix on the server, download, retake and remix
- Admin dashboard: users, jobs, failed jobs with retry, processing time, storage, cost estimates, copyright reports and support requests
- Email when a song finishes or fails (optional, needs a Resend key, and users can turn it off)
- Private library: search, sort, favorites, rename, delete, pagination
- Settings: profile, player volume, data export, account deletion
- Free to use. Monthly limits (3 songs, 500 MB of storage) that can't be bypassed by sending requests at the same time
- Copyright report form that is stored for review

## What is not built yet

I'm saying this plainly so nobody assumes it exists:

- Automatic lyric timing from speech recognition. Lyrics are synced from LRC files or by stamping lines yourself.
- Playing the vocals and the instrumental together with separate volumes in the player. You switch between the tracks.
- Changing the key live while a song plays. Key and tempo changes are rendered on the server as a preview or an export.
- Hearing your take together with the backing track before you save it. The studio plays your voice on its own, and the mix is made on the server after you save.
- Banning users or scanning uploads. Copyright reports can be reviewed and a reported song can be removed by an admin, nothing more.

There is no billing on purpose. Karaoki is free, with monthly limits.

The privacy policy, terms and copyright pages are drafts. Have a lawyer read them before you launch.

## How it fits together

```
karaoki/
  apps/web          Next.js app (App Router, TypeScript, Tailwind)
  services/api      FastAPI service: validates uploads, enforces quotas, queues jobs
  services/worker   RQ worker: runs Demucs and FFmpeg, uploads the results
  packages/shared   Types and constants used by the web app
  supabase/         SQL migrations (schema, row level security, storage policies)
  docker/           Dockerfiles
  docs/             Architecture and deployment notes
```

The short version of an upload:

1. The browser asks the web app for an upload. The web app creates the song row and a signed upload URL (using the user's own session, so row level security applies).
2. The browser uploads the file straight to private storage.
3. The web app asks the API to process the song. The API checks the file with ffprobe, checks the plan limits, reserves a quota slot in one database transaction and puts a job on the Redis queue.
4. The worker downloads the file, validates it again, runs Demucs, encodes MP3s, uploads them and marks the job finished. If anything fails the quota slot is given back.
5. The page polls the job and shows the player when it's done.

More detail is in [docs/architecture.md](docs/architecture.md).

## Running it locally

You need Node 20 or newer, Python 3.12 or 3.13, [uv](https://docs.astral.sh/uv/), FFmpeg (with the `rubberband` filter, which most builds include), Redis, and Docker for the Supabase CLI.

Create the config file once, at the repo root:

```bash
cp .env.example .env
```

The API and worker read `.env` from the repo root, and the web app loads it from there too, so you only keep one copy. Set `REDIS_PASSWORD` and `INTERNAL_API_SECRET` to any random strings.

Start Supabase and apply the migrations:

```bash
supabase init
supabase start
supabase db reset
```

`supabase init` only creates `supabase/config.toml`. It leaves the migrations folder alone. Copy the API URL, anon key, service role key and database URL that `supabase start` prints into `.env`. In the Supabase dashboard (or `supabase/config.toml`) turn on email confirmations if you want them, and add Google as a provider if you want Google sign in. Add `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/confirm` as redirect URLs.

Install everything:

```bash
npm install
(cd services/api && uv sync)
(cd services/worker && uv sync)
```

Run each piece in its own terminal. Use your Redis password in `REDIS_URL` (`redis://:PASSWORD@localhost:6379/0`):

```bash
redis-server --requirepass PASSWORD
(cd services/api && uv run uvicorn app.main:app --reload --port 8000)
(cd services/worker && uv run python -m worker.run)
(cd services/worker && uv run python -m worker.cleanup --loop)
npm run dev
```

The first job downloads the Demucs model (about 80 MB), so it takes a bit longer. Open http://localhost:3000.

On a machine without a GPU, a three minute song takes a few minutes. Set `DEMUCS_DEVICE=cuda` on a machine that has one.

## Running it with Docker Compose

```bash
docker compose up --build
```

- Set `REDIS_PASSWORD` first. Redis is only reachable from the other containers, and it is not published on your machine. The API is published on `127.0.0.1:8000` only.
- Inside the containers `127.0.0.1` means the container itself. Point `DATABASE_URL`, `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` at your hosted Supabase project, or at `host.docker.internal` if Supabase runs on your machine.
- The worker image downloads PyTorch with GPU support and bakes in the Demucs model, so it is several gigabytes.
- I could not build these images here, so treat the Docker setup as untested.

## Environment variables

| Name | Used by | What it is |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | web | Public URL of the site, used for links, the sitemap and metadata |
| `NEXT_PUBLIC_SUPABASE_URL` | web | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | Supabase anon key (safe for the browser) |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | web | Optional. Shown on the contact page |
| `NEXT_PUBLIC_ANALYTICS_DOMAIN`, `NEXT_PUBLIC_ANALYTICS_SRC` | web | Optional. Turns on cookieless Plausible-style analytics on public pages |
| `API_URL` | web | Where the web server reaches the API |
| `INTERNAL_API_SECRET` | web, api | Shared secret. When set, the API trusts the client address the web server forwards for the public forms. Without it, those limits use the connection's address |
| `REDIS_PASSWORD` | compose | Password for the Redis container |
| `DATABASE_URL` | api, worker | Postgres connection string |
| `SUPABASE_URL` | api, worker | Supabase API URL |
| `SUPABASE_ANON_KEY` | api, worker | Used to check user tokens (the worker loads the same settings) |
| `SUPABASE_SERVICE_ROLE_KEY` | api, worker | Server only. Never expose this to the browser |
| `REDIS_URL` | api, worker | Redis connection |
| `WEB_ORIGIN` | api | Allowed CORS origin |
| `DEMUCS_MODEL` | api | Model name passed to each job (the Docker image bakes in `htdemucs`) |
| `DEMUCS_DEVICE` | worker | `cpu` or `cuda` |
| `QUEUE_NAME`, `EXPORT_QUEUE_NAME`, `MIX_QUEUE_NAME` | api, worker | Names of the three queues |
| `SIGNED_URL_TTL_SECONDS`, `PROBE_TIMEOUT_SECONDS` | api, worker | Signed link lifetime and file inspection timeout |
| `STUCK_PROCESSING_MINUTES`, `STUCK_QUEUED_HOURS` | worker | When unfinished jobs, exports and mixes are failed |
| `MAX_PREVIEWS_PER_HOUR`, `MAX_TAKES_PER_SONG` | api | Limits for previews and saved takes |
| `TEMP_DIR`, `JOB_TIMEOUT_SECONDS` | worker | Scratch space and per-job time limit |
| `RATE_LIMIT_PER_MINUTE` | api | Per-user limit on processing requests |
| `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL` | api, worker | Optional. Enables the finished-job emails |
| `ADMIN_COST_PER_COMPUTE_HOUR`, `ADMIN_COST_PER_GB_MONTH` | api | Optional. Rates for the admin cost estimates |
| `MAX_RECORDING_BYTES`, `MAX_ACTIVE_EXPORTS`, `PREVIEW_RETENTION_HOURS` | api, worker | Limits for recordings and exports |
| `STALE_UPLOAD_HOURS`, `AUDIT_RETENTION_DAYS` | worker | Cleanup windows |

The service role key only lives in the API and worker. The web app never sees it.

## Tests

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

`npm test` runs the web unit tests. `npm run test:e2e` builds the app and runs the browser tests with Playwright (run `npx playwright install chromium` once).

The Python tests need a Postgres and the `redis-server` binary. They create their own throwaway database, apply the real migrations and start their own Redis. Start a Postgres for them first, for example:

```bash
docker run -d --name karaoki-test-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 55432:5432 postgres:16
```

Then run:

```bash
(cd services/api && uv run pytest)
(cd services/worker && uv run pytest)
```

Set `KARAOKI_TEST_PG` if Postgres isn't at `postgresql://postgres@localhost:55432`, and `KARAOKI_TEST_REDIS_PORT` to move the test Redis off port 56379. The worker tests include a couple that run the real Demucs model on a short clip. Skip them with `-m "not slow"`.

What the tests cover: web component behavior (polling, uploads, the recorder's microphone handling, the player and lyrics), upload validation, quota reservation under concurrent requests, row level security on every table, the API endpoints, the job pipeline (success, failures, cancellation, crashes), key and tempo changes (measured on the actual audio), recording mixes (delay, trim and gain measured on the actual audio), email, admin, the cleanup jobs and the real separation model. In the browser tests: the public pages, forms, redirects, SEO files and security headers.

What they don't cover: a full run against a real Supabase project (sign in, signed uploads, storage), the browser microphone recorder, and the Docker images. I could not run those here, and the CI workflow in `.github/workflows` has not been run.

## Deploying

- **Web:** Vercel. Set the `NEXT_PUBLIC_*` variables and `API_URL`.
- **Database, auth, storage:** a Supabase project. Run the migrations in `supabase/migrations` with `supabase db push`.
- **API, worker, Redis:** anywhere that runs containers. `docker-compose.yml` shows how they connect. The worker is the only part that needs real compute, so put it on a GPU host if you can.
- Make sure the worker and API can reach Supabase, and that Redis isn't open to the internet.

There's a longer checklist in [docs/deployment.md](docs/deployment.md).

## Security notes

- Uploads, stems and recordings are in private buckets and only reachable through signed links.
- Row level security is on for every table. Users can't change their own plan, usage or job status, and can't delete songs or takes directly. Deletion goes through the API, which removes the files first.
- Direct uploads are only accepted at `<user>/<song>/original.<ext>` or `<user>/<song>/take-<id>.<ext>` for a song the user owns. Anything left unregistered is swept after a day.
- Files are inspected with ffprobe, restricted to known audio containers. The extension and the content type the browser reports are never trusted. The worker caps how much audio it decodes.
- Quotas are reserved inside the database in one transaction, so parallel requests can't go over the limit. A job that fails, or is canceled before it starts, gives its slot back. Canceling one that is already running does not, because the compute was used.
- State-changing requests from another site are refused, and the web app sends a strict Content-Security-Policy.
- Requests are rate limited and logs don't include tokens or keys.
- Redis has a password and is not published to the network by the compose file.

## Copyright

Removing vocals does not remove copyright. Only upload music you have the right to use. Karaoki doesn't host or share songs.

## License

The two demo tracks in `apps/web/public/demo` are synthesized, and the command that makes them is in [docs/demo-audio.md](docs/demo-audio.md). All rights reserved until a license is chosen.
