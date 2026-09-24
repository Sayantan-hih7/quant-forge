import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  MinusOutlined,
} from "@ant-design/icons";
import {
  directionLabel,
  directionOf,
  signedIndexNumber,
} from "../utils/indices";
import "../../../styles/index-change.css";

export function IndexChange({
  value,
  percent = false,
  badge = false,
}: {
  value: number | null;
  percent?: boolean;
  badge?: boolean;
}) {
  const direction = directionOf(value);
  if (value === null || !Number.isFinite(value)) return <span className="index-change index-change--unknown" aria-label="Change unavailable">—</span>;
  const Icon =
    direction === "up"
      ? ArrowUpOutlined
      : direction === "down"
        ? ArrowDownOutlined
        : MinusOutlined;
  return (
    <span
      className={`index-change index-change--${direction}${badge ? " index-change--badge" : ""}`}
      aria-label={`${directionLabel[direction]} ${Math.abs(value).toFixed(2)} ${percent ? "percent" : "points"}`}
    >
      {badge && <Icon aria-hidden />}
      <span>
        {signedIndexNumber(value)}
        {percent ? "%" : ""}
      </span>
    </span>
  );
}
