import { marketIndices } from "../api/mockMarket";
export function MarketTicker() {
  return (
    <section className="market-ticker" aria-label="Mock market snapshot">
      {marketIndices.map((item) => (
        <div className="ticker-item" key={item.name}>
          <div>
            <strong>{item.name}</strong>
            <span className="mono">{item.value}</span>
          </div>
          <div className="positive mono">
            <span>{item.change}</span>
            <span>{item.percent}</span>
          </div>
        </div>
      ))}
    </section>
  );
}
