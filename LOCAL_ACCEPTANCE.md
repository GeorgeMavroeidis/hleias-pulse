# Local browser acceptance

Normal development still targets the hosted project. Use these commands before
signing in or exercising writes in a browser. They read credentials only from
the running disposable Supabase stack, require loopback addresses, and expose
only its public key to Vite. They do not read a hosted `.env` or discover keys.

```sh
npm run dev:local
```

Open `http://127.0.0.1:5183/` for the normal app with local accounts.
`/?trafficPreview=1` remains the labeled in-memory visual simulation; it does
not use Supabase or real accounts.

To exercise the same static entry as the release:

```sh
npm run build:local-test
npm run preview:local-test
```

Open `http://127.0.0.1:4183/`. This separate build is in `local-test-dist`,
never `cloudflare-static-dist`. It refuses to run on a non-loopback browser
host. A release build rejects local-only configuration.

Before guest and signed-in acceptance, inspect browser request logs and
confirm all Supabase API/Auth/Storage requests go to the status-derived
loopback endpoint. The local-only fetch guard rejects other origins and
redirects before a hosted request can be made. Local maps may still load a public basemap; this does not create
test accounts or content on any hosted data service.

Create test users only in the disposable stack, and approve test content there
when testing visibility on a second client. Use `supabase:local` for database
smoke checks. Never run a write-oriented test against the hosted project.

The local build expects a running stack. Missing status, API URL, or public key
is an error with no production fallback. Inherited `VITE_*` environment values
are discarded before status-derived public values are supplied.

Configuration regression checks:

```sh
npm run test:local-browser
npm run test:db-safety
```
