# Architecture

## Pieces

| Piece | Tech | Job |
| --- | --- | --- |
| Web | Next.js 16, React 19, Tailwind 4 | Pages, auth screens, dashboard, player. Server routes talk to Supabase and the API |
| API | FastAPI | Checks uploads, enforces plan limits, reserves quota, queues jobs, account export and deletion |
| Worker | RQ, Demucs, FFmpeg | Separates vocals, encodes MP3s, uploads results |
| Database | Postgres (Supabase) | All data, row level security, quota functions |
| Storage | Supabase Storage | Private buckets: `originals`, `stems`, `recordings` |
| Queue | Redis | Three queues (`separation`, `adjust`, `mix`) and rate limiting |

## Who is allowed to do what

The browser only ever holds the user's session. Requests that need more than the user's own rights go through the API, which holds the service role key.

- The web app creates a song row and signed upload URL as the user. Row level security makes sure it's their own row and their own folder.
- The API verifies the user's token with Supabase before doing anything, then uses a direct database connection.
- Only the service role can call `reserve_processing_job` and `finish_processing_job`. Users can't call them.

## Database

Tables: `plans`, `profiles`, `user_preferences`, `songs`, `audio_files`, `processing_jobs`, `recordings`, `audio_exports`, `lyrics`, `usage_records`, `audit_events`, `copyright_reports`, `support_requests`.

Things worth knowing:

- There is a single `free` row in `plans`. It holds the monthly job, storage, file size and duration limits, so you can change the limits with one update.
- `profiles.plan_id` and `is_admin` can't be changed by the user (column level grants).
- A partial unique index allows only one queued or processing job per song, which stops double submits.
- `reserve_processing_job` locks the user's monthly usage row, checks the plan limit, creates the job and increments usage in one transaction.
- `finish_processing_job` closes the job and gives the quota back if it failed or was canceled. Calling it twice does nothing.
- `usage_records` is keyed by month, so quotas reset by themselves.

## Job life cycle

`queued` -> `processing` -> `completed` | `failed` | `canceled`

The worker reports a stage (downloading, validating, preparing, separating, encoding, uploading) and a percentage. The separation percentage comes straight from Demucs's own progress output. Nothing is faked.

A job that gets stuck (for example the worker is killed) is failed and refunded by the cleanup process after 30 minutes without progress.

## Exports and recordings

- A key and tempo export is a row in `audio_exports`. The API queues it on the `adjust` queue and the worker renders it with FFmpeg's Rubber Band filter, so pitch and tempo are independent. Previews are the first 30 seconds and are removed after 24 hours.
- A recording starts in the browser (MediaRecorder). The browser uploads it to the private `recordings` bucket with a signed URL. The API validates the file with ffprobe and queues a mix on the `mix` queue. The worker lines it up with the instrumental using the sync offset, applies the volumes and writes an MP3. A mix can be re-done with different settings.
- Neither feature uses a monthly song credit. They are limited by rate limits, the number of running exports, and storage.

## Admin

The admin pages call the API with the signed-in user's token. The API checks `profiles.is_admin` on every request. There is no way to set that flag from the app. Set it with SQL (see the deployment notes). Admins see jobs, reports and support requests, never audio files.

## Email

When a job finishes or fails, the worker sends one email through Resend if `RESEND_API_KEY` and `EMAIL_FROM` are set and the user has not turned notifications off. Failures to send are logged and never affect the job.

## Cleanup

`python -m worker.cleanup --loop` runs every 15 minutes and:

- fails jobs that stopped making progress,
- removes uploads that never finished after 24 hours,
- removes preview exports after 24 hours,
- deletes audit events older than a year.

## Not built yet

Automatic lyric timing from speech recognition.
