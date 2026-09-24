import { Collapse, Tag } from "antd";
import { describeCondition } from "../../qualification/config/metrics";
import type { RuleTemplate } from "../../qualification/types";

export function RulePairSummary({
  entry,
  exit,
}: {
  entry: RuleTemplate;
  exit: RuleTemplate;
}) {
  return (
    <div className="bt-rule-pair">
      {[
        { rule: entry, label: "BUY · OPEN POSITION", color: "green" },
        { rule: exit, label: "SELL · CLOSE POSITION", color: "red" },
      ].map(({ rule, label, color }) => (
        <div key={label}>
          <Tag color={color}>{label}</Tag>
          <strong>{rule.name}</strong>
          <Collapse
            ghost
            size="small"
            items={[
              {
                key: rule.id,
                label: "View conditions",
                children: (
                  <>
                    <p>Combine groups with {rule.logic}</p>
                    {rule.groups.map((group, i) => (
                      <div key={i}>
                        <small>
                          {group.logic === "AND"
                            ? "All conditions"
                            : "Any condition"}
                        </small>
                        <ul>
                          {group.conditions.map((condition, j) => (
                            <li key={j}>{describeCondition(condition)}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </>
                ),
              },
            ]}
          />
        </div>
      ))}
    </div>
  );
}
