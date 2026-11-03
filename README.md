# JEE PHODENGE BY DIVYANSH

Responsive JEE 2028 preparation platform for **Study With Divyansh**. The static frontend retains the chapter tracker, study sessions, weekly analysis, streaks, and mock-test history; signed-in students also get private Supabase cloud sync, daily tasks, resources, and account settings.

## What this project uses

- HTML, CSS, and vanilla JavaScript; no npm packages or frontend build framework.
- Supabase Auth email/password sign-in, email verification, and password recovery.
- A Supabase Postgres JSONB study document per account, plus a separate student profile.
- PostgreSQL row-level security (RLS) policies that restrict each account to its own profile and study document.
- Official/public education sources and open textbooks in `resources.js`.
- Python 3's standard library for the static build and local clean-URL server.

The browser SDK is pinned to Supabase JS 2.118.0 and loaded from jsDelivr. Authentication and cloud persistence require internet access and a configured Supabase project. When no project is configured, account forms are disabled rather than simulated; the free-resource and Study With Divyansh pages remain available.

## Supabase setup

1. Create a Supabase project and open **SQL Editor**.
2. Run [`supabase/migrations/20261103000000_initial_schema.sql`](supabase/migrations/20261103000000_initial_schema.sql). It creates the profile and private per-user study-data tables, enables RLS, adds owner-only read/insert/update policies, and creates a profile when an Auth user is registered.
3. In **Project Settings → API**, copy the project URL and the **publishable key** (or legacy `anon` key). Never use the `service_role` or `sb_secret_...` key in this website.
4. Configure **Authentication → URL Configuration**:
   - Add your local and production app origins to **Site URL / Redirect URLs**.
   - Allow `http://127.0.0.1:8765/dashboard`, `http://localhost:8765/dashboard`, `https://YOUR_DOMAIN/dashboard`, and `https://YOUR_DOMAIN/reset-password` (replace with your origins).
5. In **Authentication → Providers → Email**, keep email/password enabled. Email confirmation may remain enabled; new students then confirm the email before signing in. For production, configure a reliable SMTP sender in Supabase so verification and recovery emails are delivered.

This app stores study sessions, chapter progress, mock scores, daily and weekly targets, and tasks together in the `jee_user_data.data` JSONB document. Every row is keyed by `auth.uid()`; RLS prevents one signed-in student from reading or writing another student's profile or study document. Supabase Auth manages password hashes and tokens; this site never stores or sends passwords outside Supabase Auth.

## Local development

Python 3 is the only local tool required. There is no `npm install` step.

1. Copy `.env.example` to `.env`.
2. Fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env`. These are public client values, not secret credentials.
3. Build the deployable static site and serve it with clean-path fallback:

   ```powershell
   python scripts\build.py
   python scripts\dev_server.py
   ```

4. Open `http://127.0.0.1:8765/login`.

The development server serves `dist` if a build exists and falls back to `index.html` for paths such as `/signup` and `/dashboard`. If you want to inspect public resource pages without Supabase, run the server without a configured build; sign-in remains intentionally unavailable.

Existing tracker data in the old browser `localStorage` is not uploaded automatically. On the first sign-in to an account with no saved cloud document, the app asks whether to import the prior data. It keeps that browser copy as a local backup. Student progress is subsequently scoped to the signed-in user and saved in Supabase.

## Environment values

| Name | Where it is used | Secret? |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL; public browser configuration | No |
| `SUPABASE_ANON_KEY` | Supabase publishable key or legacy anon key; protected by RLS | No |

`.env` is used by `scripts/build.py` and is ignored by Git. The build writes the public values into `dist/config.js`, which the browser loads. **Do not put the Supabase service-role or secret key in `.env`, `config.js`, or any client-side file.**

## Deploy and custom domain

### Netlify

1. Import the Git repository into Netlify.
2. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in **Site configuration → Environment variables**.
3. Deploy. `netlify.toml` runs the dependency-free Python build and publishes `dist`; `dist/_redirects` sends direct clean-URL requests through the SPA entry point.
4. In **Domain management**, add your custom domain and follow the DNS records Netlify provides. Enable HTTPS, then add the final HTTPS origin and password-recovery URL to Supabase's redirect allow-list.

### Vercel

1. Import the repository and add `SUPABASE_URL` and `SUPABASE_ANON_KEY` as project environment variables for the deployment environment.
2. Vercel uses `vercel.json` to run the Python static build, publish `dist`, and rewrite direct route requests to `index.html`.
3. Add a domain in **Project → Settings → Domains**, apply the DNS records shown by Vercel, and add the resulting HTTPS URLs to Supabase's redirect allow-list.

The included host configurations enable `/login`, `/signup`, `/dashboard`, `/todo`, `/resources`, and the other app routes to load directly and after refresh. HTTPS is required in production for safe authentication redirects.

## Updating free resources

Edit [`resources.js`](resources.js) to add or update entries. Each card accepts a `category`, `title`, `subject`, `chapter`, `description`, and HTTPS `url`. Use official, freely available resources or material whose publisher explicitly permits free access. Links open in a separate tab with `noopener noreferrer`.

## Files and routes

- `index.html`, `style.css`, `script.js` — existing tracker and new task/resource/profile views.
- `auth.js`, `config.js` — Supabase sign-in, recovery, private cloud sync, and generated public project configuration.
- `resources.js` — editable public resource catalog.
- `supabase/migrations/` — database schema, auth profile trigger, and RLS policies.
- `scripts/build.py`, `scripts/dev_server.py`, `netlify.toml`, `vercel.json`, `_redirects` — static builds and clean routes.