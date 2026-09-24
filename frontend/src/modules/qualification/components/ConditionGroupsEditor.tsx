import { Button } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { RhfInputNumber, RhfSelect } from "../../../components/forms";
import {
  allowedFrames,
  defaultCondition,
  frameLabels,
  metrics,
  operatorLabels,
} from "../config/metrics";
import type { Metric, RuleDefinition, Tier } from "../types";

type EditorValues = RuleDefinition & { entry: RuleDefinition; exit: RuleDefinition };
type RulePrefix = '' | 'entry.' | 'exit.';

function ConditionRow({
  group,
  index,
  tier,
  prefix,
  onRemove,
  canRemove,
}: {
  group: number;
  index: number;
  tier: Tier;
  prefix: RulePrefix;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { control, setValue } = useFormContext<EditorValues>();
  const path = `${prefix}groups.${group}.conditions.${index}` as const;
  const condition = useWatch({ control, name: path });
  const metricOptions = Object.entries(metrics)
    .filter(([, definition]) => tier === "tactical" || definition.base)
    .map(([value, definition]) => ({ value, label: definition.label }));
  const changeMetric = (side: "left" | "right", metric: Metric) =>
    setValue(`${path}.${side}Frame`, allowedFrames(metric, tier)[0], {
      shouldValidate: true,
      shouldDirty: true,
    });
  return (
    <div
      className="condition-row"
      aria-label={`Condition ${index + 1} in group ${group + 1}`}
    >
      <span className="condition-number">{index + 1}</span>
      <div className="condition-operand">
        <RhfSelect
          control={control}
          name={`${path}.left`}
          label="Indicator"
          options={metricOptions}
          virtual={false}
          onSelect={(value) => changeMetric("left", value)}
        />
        <RhfSelect
          control={control}
          name={`${path}.leftFrame`}
          label="Timeframe"
          options={allowedFrames(condition.left, tier).map((value) => ({
            value,
            label: frameLabels[value],
          }))}
        />
      </div>
      <RhfSelect
        control={control}
        name={`${path}.operator`}
        label="Comparison"
        options={Object.entries(operatorLabels).map(([value, label]) => ({
          value,
          label,
        }))}
      />
      <div className="condition-target">
        <RhfSelect
          control={control}
          name={`${path}.rightType`}
          label="Compare with"
          options={[
            { value: "value", label: "Value" },
            { value: "indicator", label: "Indicator" },
          ]}
        />
        {condition.rightType === "value" ? (
          <RhfInputNumber
            control={control}
            name={`${path}.value`}
            label={`Threshold (${metrics[condition.left].unit})`}
          />
        ) : (
          <>
            <RhfSelect
              control={control}
              name={`${path}.right`}
              label="Compared indicator"
              options={metricOptions}
              virtual={false}
              onSelect={(value) => changeMetric("right", value)}
            />
            <div className="condition-relative">
              <RhfSelect
                control={control}
                name={`${path}.rightFrame`}
                label="Compared timeframe"
                options={allowedFrames(condition.right, tier).map((value) => ({
                  value,
                  label: frameLabels[value],
                }))}
              />
              <RhfInputNumber
                control={control}
                name={`${path}.multiplier`}
                label="Multiplier ×"
                step={0.1}
              />
            </div>
          </>
        )}
        {condition.operator === "within" && (
          <RhfInputNumber
            control={control}
            name={`${path}.tolerance`}
            label="Distance (%)"
            step={0.5}
          />
        )}
      </div>
      <Button
        className="condition-delete"
        type="text"
        size="small"
        disabled={!canRemove}
        aria-label={`Remove condition ${index + 1} from group ${group + 1}`}
        icon={<DeleteOutlined />}
        onClick={onRemove}
      />
    </div>
  );
}
function GroupEditor({
  index,
  tier,
  prefix,
  onRemove,
  canRemove,
}: {
  index: number;
  tier: Tier;
  prefix: RulePrefix;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { control } = useFormContext<EditorValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: `${prefix}groups.${index}.conditions`,
  });
  return (
    <section
      className="condition-group"
      aria-label={`Condition group ${index + 1}`}
    >
      <header>
        <div>
          <span className="q-group-marker">
            {String(index + 1).padStart(2, "0")}
          </span>
          <strong>Condition group</strong>
        </div>
        <RhfSelect
          control={control}
          name={`${prefix}groups.${index}.logic`}
          label="Match conditions"
          options={[
            { value: "AND", label: "ALL · AND" },
            { value: "OR", label: "ANY · OR" },
          ]}
        />
        <Button
          type="text"
          size="small"
          disabled={!canRemove}
          aria-label={`Remove group ${index + 1}`}
          icon={<DeleteOutlined />}
          onClick={onRemove}
        />
      </header>
      {fields.map((field, conditionIndex) => (
        <ConditionRow
          key={field.id}
          group={index}
          index={conditionIndex}
          tier={tier}
          prefix={prefix}
          canRemove={fields.length > 1}
          onRemove={() => remove(conditionIndex)}
        />
      ))}
      <Button
        type="text"
        size="small"
        icon={<PlusOutlined aria-hidden />}
        disabled={fields.length >= 12}
        onClick={() =>
          append(
            tier === "base"
              ? { ...defaultCondition }
              : {
                  ...defaultCondition,
                  left: "rvol",
                  leftFrame: "5m",
                  value: 2,
                },
          )
        }
      >
        Add condition
      </Button>
    </section>
  );
}
export function ConditionGroupsEditor({ tier, prefix = '' }: { tier: Tier; prefix?: RulePrefix }) {
  const { control } = useFormContext<EditorValues>();
  const { fields, append, remove } = useFieldArray({ control, name: `${prefix}groups` });
  return (
    <div className="condition-groups-editor">
      <div className="q-group-logic">
        <span>Combine condition groups</span>
        <RhfSelect
          control={control}
          name={`${prefix}logic`}
          label="Group connector"
          options={[
            { value: "AND", label: "ALL groups · AND" },
            { value: "OR", label: "ANY group · OR" },
          ]}
        />
      </div>
      {fields.map((field, index) => (
        <GroupEditor
          key={field.id}
          index={index}
          tier={tier}
          prefix={prefix}
          canRemove={fields.length > 1}
          onRemove={() => remove(index)}
        />
      ))}
      <Button
        type="dashed"
        block
        icon={<PlusOutlined aria-hidden />}
        disabled={fields.length >= 6}
        onClick={() =>
          append({ logic: "AND", conditions: [{ ...defaultCondition }] })
        }
      >
        Add condition group
      </Button>
    </div>
  );
}
