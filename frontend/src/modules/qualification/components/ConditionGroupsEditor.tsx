import { useState } from "react";
import { RuleOperandParameters } from './RuleOperandParameters';
import { ruleFields } from '../config/ruleFields';
import { Alert, Button, Form, InputNumber, Select, Tag } from "antd";
import { CheckOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { RhfInputNumber, RhfSelect } from "../../../components/forms";
import {
  allowedFrames,
  conditionInsight,
  defaultCondition,
  frameLabels,
  metrics,
  operatorLabels,
  tacticalDefaultCondition,
} from "../config/metrics";
import { conditionPresetGroups, getPreset, presetForCondition, type ConditionPresetId, type PresetField } from "../config/conditionPresets";
import type { Condition, Metric, RuleDefinition, Tier } from "../types";

type EditorValues = RuleDefinition & { entry: RuleDefinition; exit: RuleDefinition };
type RulePrefix = '' | 'entry.' | 'exit.';

function PresetFieldControl({ field, condition, onChange, id }: { field: PresetField; condition: Condition; onChange: (patch: Partial<Condition>) => void; id: string }) {
  if (field.kind === "select") {
    return <Form.Item label={field.label} htmlFor={id}>
      <Select id={id} value={field.get(condition)} options={field.options} onChange={(value) => onChange(field.set(value, condition))} />
    </Form.Item>;
  }
  return <Form.Item label={field.label} htmlFor={id}>
    <InputNumber
      id={id}
      style={{ width: "100%" }}
      value={field.get(condition) ?? null}
      min={field.min}
      max={field.max}
      step={field.step ?? 1}
      onChange={(value) => { if (value != null) onChange(field.set(value, condition)); }}
    />
  </Form.Item>;
}

function ConditionRow({
  group,
  index,
  tier,
  prefix,
  onRemove,
  canRemove,
  startOpen,
}: {
  group: number;
  index: number;
  tier: Tier;
  prefix: RulePrefix;
  onRemove: () => void;
  canRemove: boolean;
  startOpen: boolean;
}) {
  const { control, setValue, trigger, getFieldState } = useFormContext<EditorValues>();
  const path = `${prefix}groups.${group}.conditions.${index}` as const;
  const condition = useWatch({ control, name: path });
  // Only read once at mount: a row just added via "Add condition" opens for editing,
  // everything already saved or loaded shows its plain-language summary first.
  const [mode, setMode] = useState<'summary' | 'edit'>(() => (startOpen ? 'edit' : 'summary'));
  const [chosenPreset, setChosenPreset] = useState<ConditionPresetId>();
  const [conditionError, setConditionError] = useState<string>();
  const metricOptions = Object.entries(metrics)
    .filter(([id, definition]) => ruleFields[id]?.trading && (tier === "tactical" || definition.base))
    .map(([value, definition]) => ({ value, label: definition.label }));
  const changeMetric = (side: "left" | "right", metric: Metric) => {
    setValue(`${path}.${side}Settings`, undefined, { shouldDirty: true });
    setValue(`${path}.${side}Period`, undefined, { shouldDirty: true });
    setValue(`${path}.${side}Offset`, undefined, { shouldDirty: true });
    setValue(`${path}.${side}Frame`, allowedFrames(metric, tier).includes(condition[side === 'left' ? 'leftFrame' : 'rightFrame']) ? condition[side === 'left' ? 'leftFrame' : 'rightFrame'] : allowedFrames(metric, tier)[0], {
      shouldValidate: true,
      shouldDirty: true,
    });
  };
  const preset = chosenPreset ?? presetForCondition(condition);
  const applyPatch = (patch: Partial<Condition>) => (Object.entries(patch) as [keyof Condition, Condition[keyof Condition]][])
    .forEach(([field, value]) => setValue(`${path}.${field}` as const, value as never, { shouldValidate: true, shouldDirty: true }));
  const changePreset = (next: ConditionPresetId) => {
    setChosenPreset(next); setConditionError(undefined);
    if (next === "custom") return;
    const defaults = getPreset(next)!.defaults(tier);
    const frame = allowedFrames(defaults.left, tier).includes(condition.leftFrame) &&
      (defaults.rightType !== 'indicator' || allowedFrames(defaults.right, tier).includes(condition.leftFrame)) ? condition.leftFrame : defaults.leftFrame;
    setValue(path, { ...defaults, leftFrame: frame, rightFrame: frame }, { shouldValidate: true, shouldDirty: true });
  };

  if (mode === "summary") {
    const insight = conditionInsight(condition);
    return (
      <div className="condition-row-summary" aria-label={`Condition ${index + 1} in group ${group + 1}`}>
        <span className="condition-number">{index + 1}</span>
        <div className="condition-summary-body">
          <Tag color={insight.kind === "bullish" ? "green" : insight.kind === "bearish" ? "red" : insight.kind === "trend" ? "gold" : insight.kind === "pattern" ? "purple" : "blue"}>{insight.label}</Tag>
          <strong>{insight.summary}</strong>
          <p className="muted">{insight.detail}</p>
        </div>
        <Button type="text" size="small" icon={<EditOutlined aria-hidden />} aria-label={`Edit condition ${index + 1}`} onClick={() => setMode("edit")}>Edit</Button>
        <Button
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

  const activePreset = preset === "custom" ? undefined : getPreset(preset);
  const preview = conditionInsight(condition);
  return (
    <div className="condition-row-edit" aria-label={`Condition ${index + 1} in group ${group + 1}`}>
      <div className="condition-preset">
        <Select
          aria-label={`Condition ${index + 1} preset`}
          showSearch={{ optionFilterProp: 'label' }}
          className="condition-preset-select"
          value={preset}
          options={conditionPresetGroups}
          onChange={(value) => changePreset(value as ConditionPresetId)}
        />
        <span className="muted">{activePreset?.hint ?? "Choose any indicator, comparison and value yourself."}</span>
      </div>
      {activePreset ? (
        <div className="condition-preset-row">
          <span className="condition-number">{index + 1}</span>
          <div className="condition-preset-fields">
            {activePreset.fields.map((field) => (
              <PresetFieldControl key={field.key} id={`${path}.preset.${field.key}`} field={field} condition={condition} onChange={applyPatch} />
            ))}
            <Form.Item label="Timeframe" htmlFor={`${path}.preset.frame`}>
              <Select
                id={`${path}.preset.frame`}
                value={condition.leftFrame}
                options={allowedFrames(activePreset.timeframeMetric, tier).map((value) => ({ value, label: frameLabels[value] }))}
                onChange={(value) => applyPatch({ leftFrame: value, rightFrame: value })}
              />
            </Form.Item>
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
      ) : (
        <div className="condition-row">
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
            <RuleOperandParameters control={control} field={condition.left} periodName={`${path}.leftPeriod`} offsetName={`${path}.leftOffset`} />
          </div>
          <RhfSelect
            control={control}
            name={`${path}.operator`}
            label="Comparison"
            options={Object.entries(operatorLabels).map(([value, label]) => ({
              value,
              label,
            }))}
            onValueChange={(next) => {
              if (next === "between" || next === "notBetween") applyPatch({ rightType: "value", value: condition.value ?? 0, upper: (condition.value ?? 0) + 10 });
              else if (next === "increasing" || next === "decreasing") applyPatch({ rightType: "value", value: 0, lookback: condition.lookback ?? 3 });
            }}
          />
          <div className="condition-target">
            {condition.operator === "between" || condition.operator === "notBetween" ? (
              <>
                <RhfInputNumber control={control} name={`${path}.value`} label={`Lower bound (${metrics[condition.left].unit})`} />
                <RhfInputNumber control={control} name={`${path}.upper`} label={`Upper bound (${metrics[condition.left].unit})`} />
              </>
            ) : condition.operator === "increasing" || condition.operator === "decreasing" ? (
              <RhfInputNumber control={control} name={`${path}.lookback`} label="Over how many candles" min={2} max={120} precision={0} />
            ) : (
              <>
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
                      options={metricOptions.filter(option => metrics[option.value as Metric].unit === metrics[condition.left].unit)}
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
                    <RuleOperandParameters control={control} field={condition.right} periodName={`${path}.rightPeriod`} offsetName={`${path}.rightOffset`} />
                  </>
                )}
                {["within", "aboveBy", "belowBy"].includes(condition.operator) && (
                  <RhfInputNumber
                    control={control}
                    name={`${path}.tolerance`}
                    label="Distance (%)"
                    step={0.5}
                  />
                )}
              </>
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
      )}
      {!activePreset && condition.operator.startsWith('cross') && <RhfInputNumber control={control} name={`${path}.lookback`} label="Cross occurred within (candles)" min={1} max={120} precision={0} placeholder="1 — latest completed candle" />}
      <div className="condition-preview"><strong>Preview:</strong> {preview.summary}</div>
      {conditionError && <Alert type="error" showIcon title={conditionError} />}
      <div className="condition-row-actions">
        <Button type="primary" size="small" icon={<CheckOutlined aria-hidden />} onClick={async () => {
          if (await trigger(path)) { setConditionError(undefined); setMode('summary'); }
          else setConditionError(Object.keys(condition).map(field => getFieldState(`${path}.${field}` as typeof path).error?.message).find(Boolean) ?? 'Complete the highlighted condition fields.');
        }}>Set condition</Button>
      </div>
    </div>
  );
}
function GroupEditor({
  index,
  tier,
  prefix,
  onRemove,
  canRemove,
  initialCondition,
  openFirst,
}: {
  index: number;
  tier: Tier;
  prefix: RulePrefix;
  onRemove: () => void;
  canRemove: boolean;
  initialCondition?: Condition;
  openFirst: boolean;
}) {
  const { control } = useFormContext<EditorValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: `${prefix}groups.${index}.conditions`,
  });
  // Tracks the index a click on "Add condition" is about to create, so only that
  // row opens in edit mode; every other row keeps whatever state it already has.
  const [addedIndex, setAddedIndex] = useState<number | null>(null);
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
          startOpen={(conditionIndex === 0 && openFirst) || addedIndex === conditionIndex}
        />
      ))}
      <Button
        type="text"
        size="small"
        icon={<PlusOutlined aria-hidden />}
        disabled={fields.length >= 12}
        onClick={() => {
          setAddedIndex(fields.length);
          append(
            initialCondition ? { ...initialCondition } : tier === "base"
              ? { ...defaultCondition }
              : { ...tacticalDefaultCondition },
          );
        }}
      >
        Add condition
      </Button>
    </section>
  );
}
export function ConditionGroupsEditor({ tier, prefix = '', initialCondition }: { tier: Tier; prefix?: RulePrefix; initialCondition?: Condition }) {
  const { control } = useFormContext<EditorValues>();
  const { fields, append, remove } = useFieldArray({ control, name: `${prefix}groups` });
  // Same pattern as the per-condition tracker: only the group just added starts open.
  const [addedGroupIndex, setAddedGroupIndex] = useState<number | null>(null);
  return (
    <div className="condition-groups-editor">
      {fields.length > 1 && <div className="q-group-logic">
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
      </div>}
      {fields.map((field, index) => (
        <GroupEditor
          key={field.id}
          index={index}
          tier={tier}
          prefix={prefix}
          canRemove={fields.length > 1}
          initialCondition={initialCondition}
          openFirst={addedGroupIndex === index}
          onRemove={() => remove(index)}
        />
      ))}
      <Button
        type="dashed"
        block
        icon={<PlusOutlined aria-hidden />}
        disabled={fields.length >= 6}
        onClick={() => {
          setAddedGroupIndex(fields.length);
          append({ logic: "AND", conditions: [{ ...(initialCondition ?? defaultCondition) }] });
        }}
      >
        Add condition group
      </Button>
    </div>
  );
}
