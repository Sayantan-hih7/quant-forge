import { Button, Empty, Grid, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { IndexQuote } from "../types/indices";
import { compareIndexValues, indexNumber } from "../utils/indices";
import { IndexFreshness } from './IndexFreshness';
import { IndexPrice } from './IndexPrice';
import { IndexChange } from "./IndexChange";
import { IndexDayRange } from "./IndexDayRange";
import { IndexSparkline } from "./IndexSparkline";

export function IndexTable({
  quotes,
  onSelect,
  onReset,
}: {
  quotes: IndexQuote[];
  onSelect: (quote: IndexQuote) => void;
  onReset: () => void;
}) {
  const { sm } = Grid.useBreakpoint();
  const compact = sm === false;
  const columns: ColumnsType<IndexQuote> = [
    {
      title: "Index",
      key: "name",
      width: compact ? undefined : 245,
      fixed: compact ? undefined : "left",
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, quote) => (
        <div className="index-name-cell">
          <button onClick={() => onSelect(quote)} className="index-name-button">
            {quote.name}
          </button>
          <div>
            <span>
              {quote.derivativeSymbol ??
                (quote.volatility
                  ? "Volatility index"
                  : quote.family === "broad"
                    ? "Broad market"
                    : "Sectoral")}
            </span>
            {quote.derivativeSymbol && <Tag bordered={false}>F&O</Tag>}
          </div>
          <IndexFreshness quote={quote} compact />
        </div>
      ),
    },
    {
      title: compact ? "Last / change" : "Last",
      dataIndex: "last",
      align: "right",
      width: compact ? 128 : 115,
      sorter: (a, b) => compareIndexValues(a.last, b.last),
      render: (_, quote) => (
        <>
          <IndexPrice quote={quote} className="index-last" />
          {compact && (
            <span className="index-mobile-change">
              <IndexChange value={quote.percent} percent badge />
            </span>
          )}
        </>
      ),
    },
    {
      title: "Change (pts)",
      dataIndex: "change",
      align: "right",
      width: 120,
      responsive: ["sm"],
      sorter: (a, b) => compareIndexValues(a.change, b.change),
      render: (value) => <IndexChange value={value} />,
    },
    {
      title: "Change (%)",
      dataIndex: "percent",
      align: "right",
      width: 125,
      responsive: ["sm"],
      sorter: (a, b) => compareIndexValues(a.percent, b.percent),
      render: (value) => <IndexChange value={value} percent badge />,
    },
    {
      title: "Open",
      dataIndex: "open",
      align: "right",
      width: 110,
      responsive: ["sm"],
      render: indexNumber,
    },
    {
      title: "Prev. close",
      dataIndex: "previousClose",
      align: "right",
      width: 110,
      responsive: ["sm"],
      render: indexNumber,
    },
    {
      title: "Day range",
      key: "range",
      width: 190,
      responsive: ["sm"],
      render: (_, quote) => <IndexDayRange quote={quote} />,
    },
    {
      title: "Trend",
      key: "trend",
      width: 125,
      responsive: ["sm"],
      render: (_, quote) => <IndexSparkline quote={quote} />,
    },
  ];
  return (
    <Table
      className="indices-table"
      rowKey="id"
      columns={columns}
      dataSource={quotes}
      size="small"
      scroll={compact ? undefined : { x: 1140 }}
      pagination={
        quotes.length > 12
          ? {
              pageSize: 12,
              showSizeChanger: false,
              showTotal: (count) => `${count} indices`,
            }
          : false
      }
      locale={{
        emptyText: (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No indices match these filters."
          >
            <Button onClick={onReset}>Reset filters</Button>
          </Empty>
        ),
      }}
    />
  );
}
