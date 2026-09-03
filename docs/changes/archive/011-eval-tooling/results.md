# 011 — Results

Date: 2026-09-03, the lead. Spend: $0.01 (one Sonnet reading of the
promoted scan). Suite: 384 tests, ruff clean, `research.check` PASS.

**Prompt comparison** (`research.report --by-prompt --photos 1,2,3,4`,
core set, live rows):

```
prompt        prefs   adapter     runs errors  on-list   p1   p2   p3   p4   p5   mean  median   p50 ms     cost
recommend_v1  flat    openai         5      0     1.00    3    1    2    4    5   2.50     2.5     4122   0.0020
recommend_v1  flat    openrouter     5      0     1.00    4    2    2    4    5   3.00     3.0     3205   0.0020
recommend_v2  export  openai         5      0     0.48    0    0    3    1    5   1.00     0.5     2896   0.0037
recommend_v2  flat    openai         5      0     1.00    3    2    2    4    5   2.75     2.5     2706   0.0021
recommend_v3  export  openai         5      0     1.00    4    3    2    4    5   3.25     3.5     3037   0.0036
recommend_v3  flat    openai         5      0     1.00    4    2    2    4    5   3.00     3.0     2402   0.0021
```

The same grid as change 004's results, from the rows, in one command. One
difference worth knowing: the v1 OpenRouter row here reads 4, 2, 2, 4
where 004's table (and change 001's) said 2, 1, 2, 4. This table takes the
latest run per photo; 001's number came from a different run of the same
cell. Both are honest; the report says which it uses.

**One command.** `research.eval` runs the two matrix stages and then the
check; `tests/test_eval_tooling.py` pins the order and the exit code. The
nightly workflow now runs `research.eval --set core --reading-set all`.

**A real scan promoted.** `photos label 143 --titles ... --partial "The
Search"` on the lead's laptop scan of core photo 1: photo 144, set `real`,
16 titles; `matrix vision sonnet --set real` read it at 15 of 16 with 0
invented, the same as the original core photo. Migration
`20260903200000_photo_set_real.sql` pushed.

## Gates

| Question | Pass |
|---|---|
| Prompts compare | The table above; `test_by_prompt_*` on seeded rows |
| One command | `test_eval_*`; the nightly workflow calls it |
| Real scans join the set | Photo 144 above; `test_promote_scan_*` with fake storage and database |
| Nothing regressed | `research.check` PASS; 384 tests |

`demo.md` in this folder is the S8 sequence. Archived 2026-09-03.
