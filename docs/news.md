# News & sentiment

**Market Data → News & events** collects Indian business news and NSE filings, links each story to listed companies, scores its likely impact, and turns that into dated per-company facts that qualification rules can use.

## Sources

| Source | What | How |
|---|---|---|
| CNBC-TV18 (markets, business), Economic Times (markets, stocks), Business Standard (markets, companies), Mint (markets, companies), Hindu BusinessLine (markets, companies), NDTV Profit | Editorial headlines | Public RSS (`backend/src/modules/news/sources.ts`) |
| Google News search | Per-company coverage from many outlets | For companies in the published qualified list and watchlists (60 per run, each at most every 2 h), and on demand when a stock's News tab opens |
| NSE corporate announcements | All filings for today and yesterday, with category | `corporate-announcements?index=equities&from_date…` |

Only headlines, short summaries and links are stored; articles stay with publishers. Moneycontrol's RSS stopped updating in 2024 and Financial Express/Zee Business no longer publish one, so they are not used. Requests are spaced at least 1.5 s per host. Aggregator quote pages and comparison widgets ("Compare X with Y", "share price … forecast") are discarded.

## Pipeline (`news` maintenance task, every 30 min 06:00–23:30 IST)

1. **Store once.** A story is identified by its canonical link and, within 3 days, by its normalised title, so the same story from several outlets is stored once with all its sources. `publishedAt` is the publisher's time; `knownAt` is when we first saw it.
2. **Link to companies.** NSE filings carry symbol/ISIN. Editorial stories are matched against an alias index built from the active company universe: the full company name, a shortened name only if unique to one company, curated newsroom nicknames (RIL, SBI, HUL, L&T, M&M, Airtel…), and capitalised ticker symbols that are not ordinary words. One-word names count only when capitalised, and shortened one-word names only in the headline. Ambiguous names ("Tata", "Apollo", "Reliance") link to nothing.
3. **Score.** Every story first gets an explainable keyword score (Indian-market phrases and NSE filing categories). Stories about a company from the last 2 days are then scored by Gemini (`GEMINI_MODEL`) in batches of 25, up to 4 batches per run: overall impact −1…+1, confidence, event type, a one-line reason, and a separate score per company (a deal can help one company and hurt another). Company names the AI finds are resolved only through the same alias index. Routine filings (AGM notices, trading-window closures, newspaper copies…) are never sent to the AI. On quota or credential errors the run stops cleanly and stories keep their keyword score.
4. **Aggregate into facts** (source `news-aggregate`, basis `derived`, one document per listing/field/day, rewritten only when values change, valid 30 h). Stories naming more than 3 companies (roundups, live blogs) count at half confidence per company. Routine filings neither count as coverage nor dilute averages.

## Rule fields (category "News & Sentiment")

| Field | Meaning |
|---|---|
| `newsSentiment7d`, `newsSentiment30d` | Confidence- and recency-weighted average impact, −100…+100 (7-day decay 3 days, 30-day decay 10 days). Unavailable with no stories. |
| `newsCount7d` | Distinct stories in 7 days (0 when none). |
| `newsPositive30d`, `newsNegative30d` | Distinct stories with impact ≥ +0.25 / ≤ −0.25 and link confidence ≥ 0.6. |
| `newsMood7d` | Positive (≥ +20), Negative (≤ −20), Neutral, or **No coverage**. |

Example: *News mood (7 days) is Positive* AND *Negative stories (30 days) at most 0*. These are snapshots dated when computed and never backdated: history exists only from the day collection started. Daily values are kept 35 days, plus each month's last value for monthly rules and backtests. A qualification scan using news fields computes the facts if they are missing (and collects news first if none has ever been collected).

## Screens

- **News & events** page: filters (about listed companies / my stocks / everything; sentiment; media vs filings; event type; period; search), story cards with sentiment, event type and clickable company chips that open the stock drawer, **Sentiment movers** (1/7/30 days, ≥ 2 stories), source counts, **Collect now**, and an exchange-wide **Events calendar** (NSE/BSE).
- **Stock drawer → News**: media coverage summary (7/30-day sentiment, mood, positive/negative counts) and recent stories, above the existing exchange filings & bulk/block deals.

Scores estimate likely impact from headlines; they are research context, not buy or sell signals.

## API

`GET /api/news` (filters as above, `kind=important` = media + directional filings), `GET /api/news/stock/:id` (`?refresh=true` searches again), `GET /api/news/movers?days=`, `GET /api/news/sources`, `POST /api/news/refresh`, `GET /api/news/events?exchange=`.
