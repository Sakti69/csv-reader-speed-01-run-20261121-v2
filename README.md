# csv-reader-speed-01-run-20261121-v2

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Sakti69/csv-reader-speed-01-run-20261121-v2/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Sakti69/csv-reader-speed-01-run-20261121-v2/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in replacement for csv-reader 1.0.0, for the make.fun
competition "Read broken CSV files faster, 21 November 2026". This is v2:
it replaces the v1 entry ("Fast CSV Reader") with a measurably faster
reader that returns exactly the same answers.

## What it is

`solve.js` exports `run(input)`, returning exactly what csv-reader 1.0.0
returns for every input `{text, header}`: `{columns, rows, errors}` under
the reference's broken-row policy (BOM dropped, LF/CRLF record ends, lone
CR outside quotes dropped as `stray_cr`, quoted fields with `""` escapes
and CR/CRLF inside read as LF, junk after a closing quote appended as
`quote_junk`, a never-closing quote read as a literal with the rest re-read
as unquoted as `unterminated_quote`, short rows padded and long rows cut to
the first record's width with `short_row` / `long_row` errors, in order met).

`main.ts` is the harness driver (unchanged from the kit's house baseline):
it reads every case from `/input/cases.json`, answers each with `run`, and
writes `/output/answers.json`.

## Why it is faster

The reference reads one character at a time, and v1 paid one regex `exec`
-- a fresh match array -- per unquoted field. v2 finds the next delimiter
with one regex `test` instead (`lastIndex` gives its position, no array is
built); the quote/CR tests that pick the fast path run on the text itself
bounded by the line end, so a slow record costs no copy of its line; and a
quoted field that closes on the line it opened on is known to hold no LF,
so only a lone CR needs a look.

Measured locally on the kit's practice set (6 cases, ~10 MB of CSV,
Node 22, CPU time, median of repeated runs): v1 ~235 ms, v2 ~166 ms --
about 30% faster than v1 and about 4.5x faster than the csv-reader 1.0.0
baseline (~730 ms). Verified identical to the reference on the practice
set, on 20,000 randomised differential cases, and on 12 freshly generated
full-size cases from the kit's own generator.

## License

MIT. See `LICENSE`.
