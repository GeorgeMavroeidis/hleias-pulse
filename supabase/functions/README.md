# Route preview function

`build-route-preview` requires a verified user JWT and an owner/editor role. Configure `ORS_API_KEY` as a Supabase Edge Function secret, never as a `VITE_` variable or in Git. The gateway must retain `verify_jwt = true` from `supabase/config.toml`.

```sh
supabase functions deploy build-route-preview
```

After the route-preview migration, the function consumes one global quota claim before contacting ORS: 20 requests in any 60 seconds and 500 in any 24 hours. It accepts only Ilia-area stops, bounds request and response sizes, and times out upstream calls after 10 seconds. The public app reads only cached geometry from the database. Existing routes use the stop-to-stop fallback until an editor rebuilds their previews.
