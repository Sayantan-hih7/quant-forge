import { Tag } from "antd";
const colors: Record<string, string> = {
  LIVE: "green",
  PAPER: "purple",
  HALTED: "red",
  FILLED: "green",
  QUEUED: "gold",
  ACTIVE: "blue",
};
export function StatusTag({ status }: { status: string }) {
  return (
    <Tag color={colors[status] ?? "default"} className="status-tag">
      {status}
    </Tag>
  );
}
