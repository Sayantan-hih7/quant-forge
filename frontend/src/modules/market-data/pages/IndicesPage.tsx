import { useState } from "react";
import { Alert, Button, Segmented, Switch, Tabs, Tag } from "antd";
import {
  DownloadOutlined,
  ExportOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useSearchParams } from "react-router-dom";
import {
  getIndexCategories,
  indexExchanges,
  isInCategory,
} from "../config/indices";
import { useIndexQuotes } from '../hooks/useIndexQuotes';
import { directionOf, indicesCsv, indexTime } from "../utils/indices";
import type {
  IndexCategory,
  IndexDirection,
  IndexExchange,
  IndexQuote,
} from "../types/indices";
import { IndexHighlights } from "../components/IndexHighlights";
import { IndexMovementSummary } from "../components/IndexMovementSummary";
import { IndexTable } from "../components/IndexTable";
import { IndexDetailDrawer } from "../components/IndexDetailDrawer";
import { IndexExchangeSelect } from "../components/IndexExchangeSelect";
import { IndexSearch } from "../components/IndexSearch";
import "../../../styles/indices.css";

export default function IndicesPage() {
  const state = useIndexQuotes();
  const [params] = useSearchParams();
  const focused = state.quotes.find(
    (quote) => quote.id === params.get("index"),
  );
  const exchange =
    focused?.exchange ??
    (params.get("exchange")?.toUpperCase() === "BSE" ? "BSE" : "NSE");
  // Navigation clears stale search text and movement filters for the selected index.
  return (
    <IndicesWorkspace
      key={`${exchange}:${params.get("index")}`}
      exchange={exchange}
      state={state}
    />
  );
}

function IndicesWorkspace({ exchange, state }: { exchange: IndexExchange; state: ReturnType<typeof useIndexQuotes> }) {
  const { quotes, sources, loading, error, refresh, autoUpdate, setAutoUpdate } = state;
  const [params, setParams] = useSearchParams();
  const exchangeConfig = indexExchanges[exchange];
  const indexCategories = getIndexCategories(exchange);
  const focusId = params.get("index");
  const selected =
    quotes.find((quote) => quote.id === focusId) ?? null;
  const requestedCategory =
    indexCategories.find((item) => item.key === params.get("category")) ??
    indexCategories[0];
  const category =
    selected && !isInCategory(selected, requestedCategory.key)
      ? indexCategories.find((item) => item.key === selected.family)!
      : requestedCategory;
  const [movement, setMovement] = useState<"all" | IndexDirection>("all");
  const exchangeQuotes = quotes.filter(
    (quote) => quote.exchange === exchange,
  );
  const benchmarks = exchangeConfig.benchmarks.flatMap((name) =>
    exchangeQuotes.filter((quote) => quote.name === name),
  );
  const grouped = exchangeQuotes.filter((quote) =>
    isInCategory(quote, category.key),
  );
  if (category.key === "derivatives")
    grouped.sort(
      (a, b) =>
        exchangeConfig.derivativeOrder.indexOf(a.derivativeSymbol!) -
        exchangeConfig.derivativeOrder.indexOf(b.derivativeSymbol!),
    );
  const filtered = grouped.filter(
    (quote) =>
      (!selected || quote.id === selected.id) &&
      (movement === "all" || directionOf(quote.change) === movement),
  );
  const reset = () => {
    setMovement("all");
  };
  const updateSelection = (key: "exchange" | "category", value: string) => {
    const next = new URLSearchParams(params);
    next.delete("index");
    next.set(key, value);
    setMovement("all");
    setParams(next);
  };
  const selectIndex = (quote: IndexQuote, targetCategory: IndexCategory = category.key) => {
    const next = new URLSearchParams(params);
    next.set("exchange", quote.exchange);
    next.set(
      "category",
      isInCategory(quote, targetCategory) ? targetCategory : quote.family,
    );
    next.set("index", quote.id);
    setParams(next);
  };
  const clearFocus = () => {
    const next = new URLSearchParams(params);
    next.delete("index");
    next.set("exchange", exchange);
    next.set("category", category.key);
    setParams(next);
  };
  const exportList = () => {
    const url = URL.createObjectURL(
      new Blob([indicesCsv(filtered)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `indices-${exchange.toLowerCase()}-${category.key}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="indices-page page-enter">
      <div className="page-heading">
        <div>
          <span className="indices-eyebrow">MARKET DATA</span>
          <h1>Indices</h1>
          <p>A clear view of the market, from benchmarks to sectors.</p>
        </div>
        <div className="indices-page-controls">
          <IndexExchangeSelect
            value={exchange}
            onChange={(value) => updateSelection("exchange", value)}
          />
          <div className="indices-snapshot">
            <Tag color="blue">EXCHANGE DATA</Tag>
            <span>{exchangeQuotes.filter(q => q.last !== null).length} / {exchangeQuotes.length} indices available</span>
          </div>
          <div className="indices-update-controls">
            <label><Switch size="small" aria-label="Auto-update index data" checked={autoUpdate} onChange={setAutoUpdate} /> Auto-update</label>
            <Button aria-label="Refresh" icon={<ReloadOutlined aria-hidden />} loading={loading || sources.some(s => s.refreshing)} onClick={() => void refresh()}>Refresh</Button>
          </div>
        </div>
      </div>
      {error && <Alert showIcon type="warning" title={error} description="Saved values retain their original timestamps. Refresh to retry." />}
      {sources.find(s => s.exchange === exchange)?.warning && <Alert showIcon type="warning" title={sources.find(s => s.exchange === exchange)?.warning} />}
      <div className="indices-update-note" role="status">
        <span>{autoUpdate ? 'Auto-update on · checks every 15 seconds' : 'Auto-update paused · use Refresh for the latest values'}</span>
        <span>Last checked: {indexTime(sources.find(s => s.exchange === exchange)?.checkedAt ?? undefined)}</span>
      </div>
      {focusId && !selected && (
        <Alert
          showIcon
          type="warning"
          title="This index is not available"
          description="The saved link does not match an index in this catalog."
          action={
            <Button size="small" onClick={clearFocus}>
              Show available indices
            </Button>
          }
        />
      )}
      <IndexSearch quotes={quotes} onSelect={(quote) => selectIndex(quote, quote.family)} />
      <IndexHighlights quotes={benchmarks} onSelect={selectIndex} />
      <section
        className="indices-workspace"
        aria-label={`${exchange} index watch`}
      >
        <div className="indices-workspace-heading">
          <div>
            <span className="indices-heading-marker" />
            <h2>Index watch</h2>
            <span className="indices-exchange" title={exchangeConfig.name}>
              {exchange}
            </span>
          </div>
          <a href={exchangeConfig.reference} target="_blank" rel="noreferrer">
            {exchange} reference <ExportOutlined aria-hidden />
          </a>
        </div>
        <Tabs
          activeKey={category.key}
          onChange={(key) => updateSelection("category", key)}
          items={indexCategories.map((item) => ({
            key: item.key,
            label: (
              <span>
                {item.label}
                <span className="indices-tab-count">
                  {
                    exchangeQuotes.filter((quote) =>
                      isInCategory(quote, item.key),
                    ).length
                  }
                </span>
              </span>
            ),
          }))}
        />
        <div className="indices-workspace-body">
          <p className="indices-category-description">{category.description}</p>
          <IndexMovementSummary quotes={grouped} />
          <div className="indices-toolbar">
            <Segmented
              aria-label="Filter indices by movement"
              value={movement}
              onChange={setMovement}
              options={[
                { label: "All moves", value: "all" },
                { label: "Up", value: "up" },
                { label: "Down", value: "down" },
                { label: "Unchanged", value: "flat" },
                { label: "Unavailable", value: "unknown" },
              ]}
            />
            <Button
              icon={<DownloadOutlined aria-hidden />}
              disabled={!filtered.length}
              onClick={exportList}
            >
              Export
            </Button>
          </div>
          <div className="indices-results-note">
            <span>
              {selected ? (
                <>
                  Focused on <strong>{selected.name}</strong>
                  <Button type="link" size="small" onClick={clearFocus}>
                    Show all indices
                  </Button>
                </>
              ) : (
                <>
                  Showing <strong>{filtered.length}</strong> of {grouped.length}{" "}
                  indices
                </>
              )}
              {movement !== "all" && (
                <Button type="link" size="small" onClick={reset}>
                  Clear filters
                </Button>
              )}
            </span>
            <span>Index values in points · Select an index for details</span>
          </div>
        </div>
        <IndexTable
          key={category.key}
          quotes={filtered}
          onSelect={selectIndex}
          onReset={reset}
        />
        <footer className="indices-table-footer">
          <span>
            ↑ Positive change <i /> ↓ Negative change <i /> — Unchanged
          </span>
          <a href={category.source} target="_blank" rel="noreferrer">
            {exchange} category reference <ExportOutlined aria-hidden />
          </a>
        </footer>
      </section>
      <p className="indices-demo-note">
        Sources: NSE and BSE public market data. Checks every 15 seconds while auto-update is on; values change when the exchange publishes an update. Daily-only indices use official closing data. Check each index’s timestamp; snapshots are not a streaming execution feed.
      </p>
      <IndexDetailDrawer quote={selected} onClose={clearFocus} />
    </div>
  );
}
