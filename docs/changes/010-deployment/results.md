# 010 — Results

Repo side done 2026-09-03 (`tasks.md`, task 0). The first deployment and
its debugging the same evening; the phone rows are still to come.

Production: https://shelfscanner-nu.vercel.app (Vercel project
`shelfscanner`, Hobby, region iad1). Bundle 47 MB, build about 35 s.

| Question | Pass | Result |
|---|---|---|
| Live | Five picks under 15 s p50 over three scans on mobile data | pending the phone; one scan from the laptop over the internet: picks 28 s after the upload (below) |
| Streams | Progress events arrive stage by stage on the deployed URL | yes: `uploaded`, `reading`, `checking`, `choosing`, `done`, `close` as separate events on the production URL, and a second connection to the same scan got `done` at once |
| Automatic | A merge to main is live within ten minutes; a branch gets a preview URL | a push to main (1fdb06f) started a production build within ten seconds and was live in about a minute, no step taken; the preview URL is pending the first branch |
| Secrets | No key in the repo; preview and production both resolve them | no key in the repo; production resolves them (the scan ran on Sonnet and GPT-5.4 mini, the admin page opens with the secret); preview pending its first deploy |

## The first scan through the deployed app (photo 145, core shelf 1, 344 KB)

| Step | Time |
|---|---|
| Upload stored (`POST /scan` returned) | 0 s |
| Extraction row written (Gemini attempted, 429, Sonnet read the shelf in 6.7 s) | +13 s |
| Lookup done (15 titles, 11 hits, 14 from the cache, 3.3 s) | +18 s |
| Recommendation row written (GPT-5.4 mini, prompt v3, 8.9 s) | +28 s |

Cost $0.011. Fifteen titles read, five picks, all on the shelf. The 28 s is
over the 15 s line before the phone is even involved; six of it is the
Gemini attempt that fails on the unfunded Google project before the
failover, and nine is the choosing model. Both are the same on the laptop.

Cold start: the first request after the build answered in 1.7 s against
0.2 to 0.3 s warm.

## What went wrong on the first deploy, for the record

- Every environment variable had been created with an empty value (the
  keys matched `.env.example`, blanks included), so the function died on
  "Missing in .env: SUPABASE_URL, SUPABASE_SECRET_KEY". Diagnosed from the
  runtime log with the Vercel CLI; fixed by re-entering the values.
- `SHELFSCANNER_FAKE_PIPELINE` was among them and was removed before it
  could take effect; `SHELFSCANNER_SPEND_CAP_USD` and
  `SHELFSCANNER_RETENTION_DAYS` were removed as unused by the app.
- The deployment-specific URL and the `-git-main` alias sit behind
  Deployment Protection; the production alias does not.
- The Vercel CLI on the laptop was 43.0.0 and its login flow had been
  retired; upgraded to 59.11.2, which uses the device flow.
