import { useState } from "react";
import { Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { StrategyTable } from "../components/StrategyTable";
import { CreateStrategyDrawer } from "../components/CreateStrategyDrawer";
export default function ExecutionStrategiesPage({
  builder = false,
  paper = false,
}: {
  builder?: boolean;
  paper?: boolean;
}) {
  const [open, setOpen] = useState(builder);
  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <h1>
            {builder
              ? "Strategy builder"
              : paper
                ? "Paper trading"
                : "Strategies"}
          </h1>
          <p>Explore and configure your demo strategy workspace.</p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setOpen(true)}
        >
          Create strategy
        </Button>
      </div>
      <StrategyTable initialFilter={paper ? "Paper" : "All"} />
      <CreateStrategyDrawer open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
