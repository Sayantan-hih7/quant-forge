import { Radio } from "antd";
import { CheckCircleFilled } from "@ant-design/icons";
import { brokers } from "../../../config/brokers";
export function BrokerSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Radio.Group
      className="broker-selector"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Select your broker"
    >
      {brokers.map((broker) => (
        <Radio.Button value={broker.id} key={broker.id}>
          <span
            className="broker-lettermark"
            style={{ color: broker.color, borderColor: broker.color }}
          >
            <img src={broker.logo} alt="" width={25} height={25} />
          </span>
          <span>
            <strong>{broker.name}</strong>
            <small>{broker.description}</small>
          </span>
          {value === broker.id && (
            <CheckCircleFilled className="broker-selected" />
          )}
        </Radio.Button>
      ))}
    </Radio.Group>
  );
}
