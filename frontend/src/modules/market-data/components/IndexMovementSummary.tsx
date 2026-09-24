import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  MinusOutlined,
} from "@ant-design/icons";
import { movementCounts } from "../utils/indices";
import type { IndexQuote } from "../types/indices";

export function IndexMovementSummary({ quotes }: { quotes: IndexQuote[] }) {
  const counts = movementCounts(quotes);
  return (
    <section
      className="index-movement-summary"
      aria-label="Index direction summary"
    >
      <div>
        <strong>{quotes.length}</strong>
        <span>indices in this group</span>
      </div>
      <div className="index-movement-legend">
        <span className="index-change--up">
          <ArrowUpOutlined aria-hidden /> <strong>{counts.up}</strong> Up
        </span>
        <span className="index-change--down">
          <ArrowDownOutlined aria-hidden /> <strong>{counts.down}</strong> Down
        </span>
        <span className="index-change--flat">
          <MinusOutlined aria-hidden /> <strong>{counts.flat}</strong> Unchanged
        </span>
        {counts.unknown > 0 && <span className="index-change--unknown"><strong>{counts.unknown}</strong> Unavailable</span>}
      </div>
      <div className="index-movement-bar" aria-hidden>
        {(["up", "down", "flat"] as const).map(
          (direction) =>
            counts[direction] > 0 && (
              <i
                className={`index-change--${direction}`}
                key={direction}
                style={{ flex: counts[direction] }}
              />
            ),
        )}
      </div>
      <span className="index-movement-basis">vs. previous close</span>
    </section>
  );
}
