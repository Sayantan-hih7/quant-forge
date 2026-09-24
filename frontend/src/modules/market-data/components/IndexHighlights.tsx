import { ArrowRightOutlined } from "@ant-design/icons";
import type { IndexQuote } from "../types/indices";
import { directionOf } from "../utils/indices";
import { IndexPrice } from './IndexPrice';
import { IndexChange } from "./IndexChange";
import { IndexSparkline } from "./IndexSparkline";
import { IndexFreshness } from './IndexFreshness';

export function IndexHighlights({
  quotes,
  onSelect,
}: {
  quotes: IndexQuote[];
  onSelect: (quote: IndexQuote) => void;
}) {
  return (
    <section className="index-highlights" aria-label="Benchmark snapshots">
      {quotes.map((quote) => (
        <button
          key={quote.id}
          className={`index-highlight index-highlight--${directionOf(quote.change)}`}
          onClick={() => onSelect(quote)}
          aria-label={`View ${quote.name} details`}
        >
          <div className="index-highlight-heading">
            <span>{quote.name}</span>
            <ArrowRightOutlined aria-hidden />
          </div>
          <IndexPrice quote={quote} className="index-highlight-price" />
          <div className="index-highlight-bottom">
            <div>
              <IndexChange value={quote.percent} percent badge />
              <small>
                <IndexChange value={quote.change} /> pts
              </small>
            </div>
            <IndexSparkline quote={quote} />
          </div>
          <IndexFreshness quote={quote} />
        </button>
      ))}
    </section>
  );
}
