# Monthly qualification data and listing history

Qualification uses the full active cash-equity universe. The existing instrument
master refresh runs on the first of each month at 02:00 IST, with catch-up when
the local app starts. A new IPO enters the universe on that refresh (or a manual
stock-universe import). Discovery does not add it to the published qualified list.

## Faster repeat scans

- Preparation checks cached company facts in batches of 100. Technical values
  stay unknown in this pass. Only a definite rejection under the complete
  AND/OR expression can skip later downloads.
- Valid company facts are reused, including across month boundaries until their
  validity expires. If a successful Dhan company snapshot omitted a metric,
  another scan reuses that absence for up to seven days. It stays missing, never
  zero. Expired metrics previously supplied by the provider are refreshed.
- Completed daily-history request ranges are merged. Only uncovered dates are
  fetched when the month changes or a rule needs a longer history. Each successful
  interval is saved independently, so interrupted imports resume from the gaps.
- The engine validates OHLCV and aggregates with pandas rather than per-row
  loops. Each stock/timeframe is aggregated once per evaluation and shared by its
  indicators. This cache lives within that evaluation, so a later cutoff or
  corrected dataset cannot accidentally reuse an older calculation.
- Preparation progress is throttled; final result counts are accumulated per
  batch with recovery from the last committed prefix instead of recounting the
  whole results collection after every batch.

Initial downloads are still subject to provider availability and rate limits.
No real-money order endpoint is involved.

The stock-detail chart refreshes recent completed daily sessions before extending
older history. When checking a range wholly before the first stored candle, the
request overlaps that known candle; only the requested gap is saved. This avoids
Dhan's `DH-907` response for an entirely unavailable early range. Failed requests
are never recorded as empty successful history. The chart shows its last candle
date separately from the live quote; a failure extending older data cannot stop
recent candles from being loaded first.

## Dhan financial-data fallback

Company imports, scan preparation and stock details share the same acquisition
path. The authenticated Dhan API is checked first. Missing ROE/ROCE then use
Dhan's publicly accessible company financial page. A stock search resolves the
page and its returned ISIN must match; the page's instrument and financial ISIN
must also match. Similar company names are never accepted as identity evidence.
Public requests are credential-free, limited across processes to one start per
750 ms, and back off on provider failures. No private API authentication is used.

Public ratios must have a valid annual report period and an explicit standalone
or consolidated basis. Missing ROE can be derived from the matching annual net
profit and positive closing total equity, consistent with the public page's
closing-equity convention. It is not average-equity ROE or an EPS/book-value
estimate. The calculation inputs, source URL, statement basis and period are
stored with the fact. Future reports, reports older than 550 days, mismatched
arrays/periods, missing values and non-positive equity are not used for derivation.

Facts are cached for up to seven days, bounded by report age. Successful missing
values and failed requests have separate retry receipts, independent of the API's
missing-field cache. Existing valid API facts are not overwritten by the fallback.
Public pages may change or omit companies; missing values remain unavailable.
The collection time remains `knownAt`, even for older financial years: these
snapshots do not establish historical publication dates for backtesting.

If the page's consolidated ratio is obsolete but current standalone annual
accounts exist, ROE can be derived from the latter's matching income and equity
statements. This does not mix accounting bases. The fact is labelled standalone.
Missing-field receipts include the parser version so a repaired parser can
revisit earlier omissions without waiting for the normal weekly refresh.

## Exchange shareholding recovery

Missing promoter encumbrance is now resolved per company during preparation,
after cheap fundamental exclusions and before expensive historical downloads.
The presence of some pledge facts in the database no longer suppresses recovery
for the remaining companies.

- NSE's equity and SME filing indices locate the individual XBRL report. The
  actual filing ISIN must match the instrument; a stale ISIN in the index after
  a stock split does not override the verified filing. Capital-allotment reports
  use their XBRL observation instant, not their later preparation date.
- BSE's individual consolidated-pledge record identifies the filing quarter and
  publication date. Its promoter-group detail and, when needed, summary provide
  explicit totals. Both must match the selected publication date.
- `pledge` retains the existing meaning: total encumbered promoter shares divided
  by total promoter holding, multiplied by 100. Depository-wide pledge percentages
  and total-company-share denominators are never substituted. Count-derived
  percentages retain precision; display rounding does not alter comparisons.
- An explicit no-encumbrance declaration can establish zero. Missing columns,
  a missing company in a consolidated list, or failed requests cannot.
- Verified no-promoter companies store `not-applicable`, with their evidence.
  These meet a literal nonnegative `<=` maximum-encumbrance limit (or `<` a
  positive maximum); other numeric comparisons remain undecided. The engine
  explains this policy in the stock's rule result rather than manufacturing 0%.
- Facts carry the source link, report period, collection time and supporting
  promoter/encumbered share counts. Reports expire after 150 days. Collection
  time is not backdated, so these imports do not create historical availability
  for a backtest.

Public requests have a strict host/path allowlist, no broker credentials or
redirects, bounded response sizes and timeouts, Redis request spacing and
provider cooldowns. Failed requests have short retry receipts; unresolved report
formats retry later without inventing data. Successful facts are shared across
the same ISIN's listings and reused on subsequent scans. Public exchange readers
are a free fallback, not a guaranteed-availability bulk-data service.

The scan screen displays missing-input counts, separates them from rule failures
and insufficient monthly history, and provides **Retry missing data**. Retrying
prepares missing inputs and evaluates the saved rules again using cached data;
it does not publish the result. Concurrent coverage requests share one calculation
so repeated UI refreshes do not start duplicate database aggregations. Coverage
loads in the background: cold-cache aggregation does not hold up page loading,
scan submission or progress polling. Its snapshot retains its checked timestamp.

## IPOs and insufficient history

Minimum history comes from the chosen conditions, not a blanket listing age.
Monthly EMA 21 needs at least 21 completed monthly candles; a crossover over the
last six candles needs 27. Extra EMA warm-up requested by the data planner is
preferred history, not an additional eligibility requirement. The forming month
is excluded. A fundamentals-only rule can qualify a new listing if its required
facts are available; AND/OR conditions retain their normal meaning.

Results distinguish:

- **Qualified:** the rule evaluates true.
- **Did not match:** the rule evaluates false, including a definite failing AND
  condition when another input is missing.
- **Awaiting monthly history:** the undecided conditions need more completed
  monthly candles. Results include available and required counts. A successful
  empty history request can report zero candles; an unattempted/failed request
  cannot establish this status.
- **Missing data:** missing reports, a failed/unloaded history request, stale
  history or a gap in consecutive monthly candles. These do not prove an IPO.

Short history is not asserted to be a verified listing date. Review source
coverage if an established company appears with unexpectedly short history.
Awaiting-history stocks remain in the market universe and are evaluated on the
next scan. They are not silently qualified, and daily candles are never substituted
for monthly candles. Publishing still requires review; manual additions retain
their independent labels and do not claim that the monthly rules passed.
