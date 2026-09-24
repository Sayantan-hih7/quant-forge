import { Table } from "antd";
import { Panel } from "../../../components/ui/Panel";
import { StatusTag } from "../../../components/ui/StatusTag";
const orders = [
  {
    id: "QF-9021",
    time: "10:31:22",
    symbol: "RELIANCE",
    side: "BUY",
    quantity: 100,
    price: "₹2,945.50",
    status: "FILLED",
  },
  {
    id: "QF-9020",
    time: "10:30:48",
    symbol: "HDFCBANK",
    side: "BUY",
    quantity: 75,
    price: "₹1,684.20",
    status: "FILLED",
  },
  {
    id: "QF-9019",
    time: "10:29:12",
    symbol: "NIFTY 24700 CE",
    side: "SELL",
    quantity: 50,
    price: "₹142.80",
    status: "QUEUED",
  },
];
export function ActivityTable({ variant }: { variant: string }) {
  const positions = variant === "portfolio";
  const audit = variant === "audit";
  return (
    <Panel
      title={
        positions
          ? "Open positions · Demo snapshot"
          : audit
            ? "Execution audit · Demo events"
            : "Recent orders · Demo snapshot"
      }
    >
      <Table
        rowKey="id"
        pagination={false}
        dataSource={
          positions ? orders.filter((o) => o.status === "FILLED") : orders
        }
        scroll={{ x: 720 }}
        columns={[
          { title: "Reference", dataIndex: "id" },
          { title: "Time (IST)", dataIndex: "time" },
          { title: "Instrument", dataIndex: "symbol" },
          {
            title: "Side",
            dataIndex: "side",
            render: (v: string) => (
              <span className={v === "BUY" ? "positive" : "negative"}>{v}</span>
            ),
          },
          { title: "Quantity", dataIndex: "quantity" },
          { title: positions ? "Entry price" : "Price", dataIndex: "price" },
          {
            title: "Status",
            dataIndex: "status",
            render: (v: string) => (
              <StatusTag status={positions ? "ACTIVE" : v} />
            ),
          },
        ]}
      />
    </Panel>
  );
}
