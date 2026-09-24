import { Drawer, Tag } from "antd";
import { ExportOutlined } from "@ant-design/icons";
import type { IndexQuote } from "../types/indices";
import { getIndexCategories } from "../config/indices";
import { IndexFreshness } from './IndexFreshness';
import { indexNumber } from "../utils/indices";
import { IndexChange } from "./IndexChange";
import { IndexSparkline } from "./IndexSparkline";
import { IndexDayRange } from "./IndexDayRange";
import { IndexPrice } from './IndexPrice';
import { IndexReferenceCloses } from './IndexReferenceCloses';

export function IndexDetailDrawer({
  quote,
  onClose,
}: {
  quote: IndexQuote | null;
  onClose: () => void;
}) {
  return (
    <Drawer
      title={quote?.name ?? "Index details"}
      open={!!quote}
      onClose={onClose}
      size={580}
    >
      {quote && (
        <div className="index-detail">
          <div className="index-detail-tags">
            <Tag>{quote.exchange}</Tag>
            <Tag>{quote.family === "broad" ? "Broad market" : "Sectoral"}</Tag>
            {quote.derivativeSymbol && (
              <Tag color="blue">
                Derivatives eligible · {quote.derivativeSymbol}
              </Tag>
            )}
            <IndexFreshness quote={quote} compact />
          </div>
          <IndexPrice quote={quote} className="index-detail-price" />
          <div className="index-detail-change">
            <IndexChange value={quote.change} />
            <span>pts</span>
            <IndexChange value={quote.percent} percent badge />
          </div>
          <p className="index-caption">
            <IndexFreshness quote={quote} />
          </p>
          <section className="index-detail-chart" aria-label="Intraday chart">
            <header>
              <h3>{quote.status === 'eod' ? 'Daily history' : 'Market movement'}</h3>
              {quote.previousClose !== null && quote.status !== 'eod' && <span>Dashed line: previous close</span>}
            </header>
            <IndexSparkline quote={quote} expanded />
            <footer>
              <span>Time in IST</span>
              <span>Hover or use arrow keys to inspect</span>
            </footer>
          </section>
          <div className="index-detail-metrics">
            {[
              ["Open", quote.open],
              ["Previous close", quote.previousClose],
              ["Day high", quote.high],
              ["Day low", quote.low],
              ["52-week high", quote.high52w],
              ["52-week low", quote.low52w],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{indexNumber(typeof value === 'number' ? value : null)}</strong>
              </div>
            ))}
          </div>
          <h3 className="index-detail-range-title">
            Position in today's range
          </h3>
          <IndexDayRange quote={quote} />
          <IndexReferenceCloses quote={quote} />
          {(quote.advances != null || quote.pe != null) && <section className="index-reference-closes" aria-label="Index breadth and valuation">
            <h3>Breadth & valuation</h3><div className="index-detail-metrics">
              {([['Advancing stocks',quote.advances],['Declining stocks',quote.declines],['Unchanged stocks',quote.unchanged],['P/E',quote.pe],['P/B',quote.pb],['Dividend yield (%)',quote.dividendYield]] as const).map(([label,value]) => <div key={label}><span>{label}</span><strong>{indexNumber(value)}</strong></div>)}
            </div>
          </section>}
          <p className="index-detail-note">
            {quote.source ?? 'Exchange data is not available yet'}. Index values are shown in points. A dash means the source did not supply that metric. Collected snapshots cover only the period captured by this workspace.
          </p>
          <div className="index-detail-sources">
            {quote.sourceUrl && <a href={quote.sourceUrl} target="_blank" rel="noreferrer">View price source <ExportOutlined aria-hidden /></a>}
            {getIndexCategories(quote.exchange)
              .filter(
                (category) =>
                  category.key === quote.family ||
                  (category.key === "derivatives" && quote.derivativeSymbol),
              )
              .map((category) => (
                <a
                  key={category.key}
                  href={
                    category.key === "derivatives"
                      ? (quote.derivativeSource ?? category.source)
                      : category.source
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  {quote.exchange} {category.label.toLowerCase()} reference{" "}
                  <ExportOutlined aria-hidden />
                </a>
              ))}
          </div>
        </div>
      )}
    </Drawer>
  );
}
