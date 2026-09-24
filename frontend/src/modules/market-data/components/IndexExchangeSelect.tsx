import { Segmented } from "antd";
import type { IndexExchange } from "../types/indices";

export function IndexExchangeSelect({
  value,
  onChange,
}: {
  value: IndexExchange;
  onChange: (value: IndexExchange) => void;
}) {
  return (
    <div className="index-exchange-select">
      <span>Exchange</span>
      <Segmented<IndexExchange>
        aria-label="Stock exchange"
        value={value}
        onChange={onChange}
        options={["NSE", "BSE"]}
      />
    </div>
  );
}
