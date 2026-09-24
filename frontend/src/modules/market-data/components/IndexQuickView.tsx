import { ArrowRightOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import type { IndexQuote } from "../types/indices";
import { IndexFreshness } from './IndexFreshness';
import { indexNumber } from "../utils/indices";
import { indexDetailsPath } from "../utils/indexLinks";
import { IndexChange } from "./IndexChange";
import "../../../styles/index-quick-view.css";

export function IndexQuickView({
  quote,
  membershipLabel,
}: {
  quote: IndexQuote;
  membershipLabel?: string;
}) {
  return (
    <section className="index-quick-view" aria-label={`${quote.name} preview`}>
      <div className="index-quick-heading">
        <strong>{quote.name}</strong>
        <span>{quote.exchange}</span>
      </div>
      <p>
        {quote.family === "broad" ? "Broad market" : "Sectoral"}
        {quote.derivativeSymbol && " · F&O eligible"}
      </p>
      <div className="index-quick-price">
        <strong>{indexNumber(quote.last)}</strong>
        <IndexChange value={quote.percent} percent badge />
      </div>
      <div className="index-quick-move">
        <IndexChange value={quote.change} /> points vs previous close
      </div>
      <dl>
        <div>
          <dt>Day low</dt>
          <dd>{indexNumber(quote.low)}</dd>
        </div>
        <div>
          <dt>Day high</dt>
          <dd>{indexNumber(quote.high)}</dd>
        </div>
      </dl>
      {membershipLabel && (
        <p className="index-quick-membership">
          Stock membership · {membershipLabel} saved list
        </p>
      )}
      <IndexFreshness quote={quote} />
      <Link to={indexDetailsPath(quote)}>
        View index details <ArrowRightOutlined aria-hidden />
      </Link>
    </section>
  );
}
