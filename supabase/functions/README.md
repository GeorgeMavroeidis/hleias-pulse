# Route preview function

`build-route-preview` is authenticated and accepts owner/editor requests only. Configure its provider credential as a Supabase secret, never as a `VITE_` variable:

```sh
supabase secrets set ORS_API_KEY=your_openrouteservice_key
supabase functions deploy build-route-preview
```

The public app reads only cached route geometry from the database. The provider key is never sent to the browser.
