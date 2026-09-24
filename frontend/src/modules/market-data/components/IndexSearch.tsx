import { useId, useState } from "react";
import { AutoComplete, Input, type AutoCompleteProps } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import type { IndexQuote } from "../types/indices";
import { indexNumber, matchesIndexSearch } from "../utils/indices";
import { IndexChange } from "./IndexChange";
import { IndexFreshness } from './IndexFreshness';

const popularNames = new Set([
  "NIFTY 50", "NIFTY BANK", "NIFTY IT",
  "BSE SENSEX", "BSE BANKEX", "BSE 500",
]);
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

function searchRank(quote: IndexQuote, query: string) {
  const names = [quote.name, quote.name.replace(/^(BSE|NSE) /, ""), quote.derivativeSymbol ?? ""]
    .map(normalize);
  if (names.includes(query)) return 0;
  return names.some((name) => name.startsWith(query)) ? 1 : 2;
}

export function IndexSearch({
  quotes,
  onSelect,
}: {
  quotes: IndexQuote[];
  onSelect: (quote: IndexQuote) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const searching = !!query.trim();
  const matches = quotes
    .filter((quote) => searching ? matchesIndexSearch(quote, query) : popularNames.has(quote.name))
    .sort((a, b) => searchRank(a, normalize(query)) - searchRank(b, normalize(query)) || a.name.localeCompare(b.name));
  const options: NonNullable<AutoCompleteProps["options"]> = ["NSE", "BSE"].flatMap((exchange) => {
    const group = matches.filter((quote) => quote.exchange === exchange);
    return group.length ? [{
      label: <span className="index-search-group">{exchange}<span>{searching ? `${group.length} matches` : "Popular indices"}</span></span>,
      options: group.map((quote) => ({
        value: quote.id,
        label: (
          <div className="index-search-result">
            <div className="index-search-result-info">
              <strong>{quote.name}</strong>
              <div>
                <span className="index-search-exchange">{quote.exchange}</span>
                <span>{quote.family === "broad" ? "Broad market" : "Sectoral"}</span>
                {quote.derivativeSymbol && <span className="index-search-derivative">Derivatives eligible</span>}
              </div>
            </div>
            <div className="index-search-result-price">
              <span>{indexNumber(quote.last)}</span>
              <IndexChange value={quote.percent} percent badge />
              <IndexFreshness quote={quote} compact />
            </div>
          </div>
        ),
      })),
    }] : [];
  });

  return (
    <section className="index-search" aria-label="Find an index across exchanges">
      <label htmlFor={id}>Find an index <span>NSE + BSE</span></label>
      <AutoComplete
        value={query}
        onChange={setQuery}
        open={open}
        onOpenChange={setOpen}
        onFocus={() => setOpen(true)}
        onSelect={(value) => {
          const quote = quotes.find((item) => item.id === value);
          if (!quote) return;
          setQuery("");
          setOpen(false);
          onSelect(quote);
        }}
        options={options.length ? options : [{
          value: "no-index-results",
          disabled: true,
          label: <div className="index-search-empty"><strong>No indices found</strong><span>Try another index name or symbol across NSE and BSE.</span></div>,
        }]}
        showSearch={{ filterOption: false }}
        defaultActiveFirstOption
        virtual={false}
        listHeight={360}
        classNames={{ popup: { root: "index-search-popup" } }}
        popupRender={(menu) => <>{menu}<div className="index-search-footer">All categories · Exchange snapshots and daily closes</div></>}
      >
        <Input
          id={id}
          aria-label="Search indices across NSE and BSE"
          allowClear
          prefix={<SearchOutlined aria-hidden />}
          placeholder="Search by name or symbol, e.g. SENSEX"
        />
      </AutoComplete>
      <p>Search both exchanges. Choose a suggestion to open its market view.</p>
    </section>
  );
}
