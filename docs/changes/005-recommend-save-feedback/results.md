# 005 — Results

Written 2026-09-03 by the lead. Tasks 1 to 4 and 6 are done and in main;
task 5's Playwright suite passes; the phone half of task 5 is Marina's and
is what keeps this change open. Same late-file story as 003.

Spec: `docs/specs/web.md` (preferences page, recommendation in the scan,
save and not-for-me, `/saved`), `feedback.md`, `preferences.md`.

**Built.** Preferences page (free text, genres, Goodreads CSV import);
choosing runs in the scan after reading and, since 007, after the catalogue
check; five picks with reasons; save and unsave, "not for me", `/saved`;
`saved` and `feedback` tables; `report` prints the save rate over app
scans, and 009's dashboard shows it per day.

**Measured on the laptop** (real project, real models; both primaries
without keys, so reading ran on Sonnet and choosing on Haiku by failover,
which costs no time since a missing key fails instantly):

| scan | upload → five picks | reading | checking | choosing |
|---|---|---|---|---|
| 140 | 16.7 s (choosing failed: OpenRouter 429 on the then-fallback Qwen) | 4.5 s | cold | 7.4 s |
| 141 | 15.4 s | 4.2 s | cold | 5.8 s |
| 142 | 16.9 s | 7.3 s | 3.4 s | 4.4 s |

p50 16.7 s against the 15 s line: **over**. Two reasons, both known. The
catalogue check (007) was added after this line was set and costs 3 to 4 s
cold, under 0.3 s once the shelf's titles are cached (008). And neither
primary has run yet; the 001 numbers say Gemini 3.8 Flash reads in about
the same time as Sonnet and GPT-5.4 mini chooses in 3.2 s against Haiku's
4 to 6 s. Expect about 13 s cold and 10 s warm once the keys are in; that
is the number to record from the phone.

Feedback live: 1 save and 1 not-for-me from the lead's scans; `report`
prints `save rate 0.50 per scan (1 saves / 2 scans)`.

## Gates

| Question | Pass |
|---|---|
| End to end on a phone | **Pending Marina**: three real scans. Laptop p50 16.7 s, over the 15 s line for the two reasons above |
| Feedback lands | `tests/e2e/test_feedback_flow.py`: save two, unsave one, mark one; the rows and `/saved` match |
| Metric is live | `report` prints the save rate over app scans; live output above |
| Nothing regressed | `research.check` PASS; CLI unchanged |

**To close:** the phone scans (with 003's), ideally after `GEMINI_API_KEY`
and `OPENAI_API_KEY` are in `.env` so the measurement is of the chosen
models. If the phone p50 is still over 15 s on the primaries, the line
moves or the check gets a budget; that is a decision for the results, not
a silent pass.
