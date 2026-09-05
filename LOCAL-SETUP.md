# Running the app locally

The site is a React frontend plus an Azure Functions API. The frontend alone
will render the curriculum, but everything that needs an account — progress
sync, comments, notes, bookmarks, the admin dashboard — needs the API running
too, and the API talks to real Azure Table Storage.

## One-time setup

### 1. Azure Functions Core Tools

```bash
npm install -g azure-functions-core-tools@4 --unsafe-perm true
func --version          # expect 4.x
```

> [!NOTE]
> Recent npm blocks package install scripts by default and prints a warning
> about `allow-scripts`. The install still exits 0. Check `func --version`
> actually works — if the command isn't found, the post-install step that
> downloads the binary was skipped, and you need:
>
> ```bash
> npm install -g --allow-scripts=azure-functions-core-tools azure-functions-core-tools@4
> ```

### 2. Dependencies

```bash
cd webapp && npm install
cd ../api && npm install
```

### 3. `api/local.settings.json`

`func start` reads its configuration from this file. It is **gitignored** and
must stay that way — it holds the storage account key, the session signing
secret, and the Google OAuth client secret.

Generate it from the deployed app's settings:

```bash
az login
python scripts/write-local-settings.py
```

The script prints which keys it found, never their values, so running it
doesn't leave credentials in your terminal history or a screen recording.

<details>
<summary>Or write it by hand</summary>

Copy the values from **Azure Portal → Static Web App → Configuration →
Application settings**:

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AzureWebJobsStorage": "<same as TABLE_STORAGE_CONNECTION_STRING>",
    "TABLE_STORAGE_CONNECTION_STRING": "...",
    "SESSION_SECRET": "...",
    "GOOGLE_CLIENT_ID": "...",
    "GOOGLE_CLIENT_SECRET": "...",
    "IMAGES_CONTAINER_SAS": "...",
    "FEED_CONTAINER_SAS": "...",
    "BACKUPS_CONTAINER_SAS": "...",
    "GITHUB_PAT": "...",
    "SITE_ORIGINS": "http://localhost:4173"
  },
  "Host": { "CORS": "*" }
}
```

Two values differ from production on purpose — see
[Why the port matters](#why-the-port-matters) and
[The trailing carriage return](#the-trailing-carriage-return).

</details>

> [!WARNING]
> This puts production credentials on your disk in plaintext. Delete the file
> when you're done if the machine is shared, and never `git add -f` it. If it
> leaks, rotate the **storage account key first** — it's the one whose
> rotation also invalidates every SAS token issued from it.

## Running it

Two terminals.

**Backend** — the Functions host, against real Table Storage:

```bash
cd api
func start --port 7071
```

**Frontend** — pick one:

```bash
cd webapp
npm run dev -- --port 4173        # hot reload, for working on the UI
npm run preview -- --port 4173    # the real built output, closer to production
```

Then open **<http://localhost:4173>**, or
**<http://localhost:4173/#__admin>** for the admin dashboard.

Both Vite modes proxy `/api` to `http://localhost:7071`, configured in
[`webapp/vite.config.js`](webapp/vite.config.js). `npm run preview` serves what
`npm run build` produced, so run a build first if you've changed anything.

## Why the port matters

Use **4173**. Not 5173, not 3000.

Google only redirects OAuth back to a URI registered on the client, and
`http://localhost:4173/api/auth/callback` is the one registered for local
development. `SITE_ORIGINS` in `local.settings.json` is set to
`http://localhost:4173` to match.

On any other port you'll get `redirect_uri_mismatch` from Google, or a
`400 Sign-in link expired or invalid` from the callback — the `oauth_state`
cookie is host-and-port scoped, so if the callback lands on a different origin
than the one that set it, the cookie never arrives. See the comments in
[`api/src/functions/auth.js`](api/src/functions/auth.js).

To use a different port, add `http://localhost:<port>/api/auth/callback` to
**Google Cloud Console → Credentials → your OAuth client → Authorized redirect
URIs**, and change `SITE_ORIGINS` to match.

## Signing in

The admin screens are auth-gated: `/api/manage/*` returns **401** until you
sign in, and **403** if you're signed in as someone who isn't an admin. Both
are correct — a 401 from `curl` means the API is up and working.

Local sign-in uses the **real** Google OAuth app and the **real** session
secret, so you sign in as your actual account and see your actual data.

Admin access is granted by email address: the owner is hardcoded in
[`api/src/lib/adminAuth.js`](api/src/lib/adminAuth.js), and anyone else is a
row in the `Admins` table, managed from **Admin → People**.

## Expected noise

**`The listener for function 'Functions.dailyBackup' was unable to start.`**
The timer trigger's schedule monitor needs a storage account.
`write-local-settings.py` sets `AzureWebJobsStorage` to silence it. If you
wrote the file by hand and left that key empty, you'll see this on every start
plus a `Process reporting unhealthy` line. It affects only the nightly backup
timer — every HTTP endpoint works regardless.

**Port already in use.** Find and stop the holder:

```powershell
Get-NetTCPConnection -LocalPort 4173 -State Listen |
  Select-Object -Expand OwningProcess |
  ForEach-Object { Stop-Process -Id $_ -Force }
```

## The trailing carriage return

The deployed `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` carry a trailing
`\r` from a Windows paste into the portal. `auth.js` trims both, so this is
survivable — but an untrimmed client id fails the `claims.aud` equality check
on every callback, which presents as "Token validation failed" with nothing
obviously wrong in the config. `write-local-settings.py` strips it. Worth
cleaning up in Azure the next time those values are rotated.

## Working without the API

If you only need to read curriculum content or work on presentation, skip the
backend entirely:

```bash
cd webapp && npm run dev -- --port 4173
```

Progress tracking still works — it's IndexedDB-backed offline and only syncs
to the server once you're signed in. Everything account-shaped (sign-in,
comments, notes, bookmarks, admin) will fail its fetch and render its error
state, which is the same thing that happens on the GitHub Pages mirror.

## Before you push

CI runs these, so run them first if you've touched the API:

```bash
node scripts/check-admin-guards.js    # every isAdmin() awaited; every API file parses
cd webapp && npm run build
```
