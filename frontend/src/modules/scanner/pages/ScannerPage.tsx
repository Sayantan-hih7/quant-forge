import { useState } from "react";
import { Button, Form, Table, Tag } from "antd";
import { RadarChartOutlined } from "@ant-design/icons";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { RhfAutoComplete, RhfSelect } from "../../../components/forms";
import { Panel } from "../../../components/ui/Panel";
const schema = z.object({
  universe: z.enum(["NIFTY 50", "NIFTY 500"]),
  signal: z.enum(["All", "Momentum", "Breakout"]),
});
type Values = z.infer<typeof schema>;
const candidates = [
  {
    symbol: "RELIANCE",
    price: "₹2,945.50",
    change: "+1.42%",
    signal: "Momentum",
    score: 94,
    universe: "NIFTY 50",
  },
  {
    symbol: "HDFCBANK",
    price: "₹1,684.20",
    change: "+0.84%",
    signal: "Breakout",
    score: 89,
    universe: "NIFTY 50",
  },
  {
    symbol: "INFY",
    price: "₹1,922.75",
    change: "+1.16%",
    signal: "Momentum",
    score: 87,
    universe: "NIFTY 50",
  },
  {
    symbol: "PERSISTENT",
    price: "₹5,218.40",
    change: "+2.12%",
    signal: "Breakout",
    score: 91,
    universe: "NIFTY 500",
  },
];
export default function ScannerPage() {
  const { control, handleSubmit } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { universe: "NIFTY 50", signal: "All" },
  });
  const [result, setResult] = useState<Values | null>(null);
  const rows = result
    ? candidates.filter(
        (s) =>
          (result.universe === "NIFTY 500" || s.universe === result.universe) &&
          (result.signal === "All" || s.signal === result.signal),
      )
    : [];
  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <h1>Market scanner</h1>
          <p>Discover opportunities using a fixed demo market snapshot.</p>
        </div>
        <Tag color="purple">SIMULATION</Tag>
      </div>
      <Panel title="Scan configuration">
        <Form
          layout="vertical"
          onFinish={handleSubmit(setResult)}
          className="scanner-form"
        >
          <RhfAutoComplete
            name="universe"
            label="Market universe"
            control={control}
            options={[{ value: "NIFTY 50" }, { value: "NIFTY 500" }]}
          />
          <RhfSelect
            name="signal"
            label="Signal type"
            control={control}
            options={["All", "Momentum", "Breakout"].map((value) => ({
              value,
              label: value,
            }))}
          />
          <Button
            type="primary"
            htmlType="submit"
            icon={<RadarChartOutlined />}
          >
            Run demo scan
          </Button>
        </Form>
      </Panel>
      <Panel
        title={
          result ? `Scan results · ${rows.length} matches` : "Scan results"
        }
        className="mt-5"
      >
        <Table
          rowKey="symbol"
          dataSource={rows}
          pagination={false}
          scroll={{ x: 600 }}
          locale={{
            emptyText: result
              ? "No matching candidates."
              : "Run a scan to view matching instruments.",
          }}
          columns={[
            { title: "Instrument", dataIndex: "symbol" },
            { title: "Last price", dataIndex: "price" },
            {
              title: "Change",
              dataIndex: "change",
              render: (v: string) => <span className="positive">{v}</span>,
            },
            { title: "Signal", dataIndex: "signal" },
            {
              title: "Score / 100",
              dataIndex: "score",
              sorter: (a, b) => a.score - b.score,
            },
          ]}
        />
      </Panel>
    </div>
  );
}
