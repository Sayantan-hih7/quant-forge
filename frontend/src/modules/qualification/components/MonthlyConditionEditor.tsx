import { Button, Tag } from 'antd';
import { createContext, useContext } from 'react';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { RhfInput, RhfInputNumber, RhfSelect } from '../../../components/forms';
import { RhfChoiceSelect } from '../../../components/forms/RhfChoiceSelect';
import { isDistance, isRange, isTrend, monthlyCategories, monthlyFields, monthlyOperatorLabels, monthlyOperators, newMonthlyCondition } from '../config/monthlyFields';
import type { MonthlyOperator, MonthlyRuleDefinition } from '../types/monthly';
import type { RuleCapabilities } from '../types/backend';

const CapabilitiesContext = createContext<RuleCapabilities | undefined>(undefined);

function MonthlyConditionRow({ group, index, onRemove, canRemove }: { group: number; index: number; onRemove: () => void; canRemove: boolean }) {
  const { control, setValue } = useFormContext<MonthlyRuleDefinition>();
  const capabilities = useContext(CapabilitiesContext);
  const path = `groups.${group}.conditions.${index}` as const;
  const condition = useWatch({ control, name: path });
  const definition = monthlyFields[condition.field];
  const numeric = definition.kind === 'number';
  const range = isRange(condition.operator);
  const trend = isTrend(condition.operator);
  const distance = isDistance(condition.operator);
  const availableFields = Object.entries(monthlyFields).filter(([key]) => !capabilities || capabilities.monthlyFields.includes(key));
  const categories = monthlyCategories.filter(category => availableFields.some(([, field]) => field.category === category.value));
  const fields = availableFields.filter(([, field]) => field.category === condition.category).map(([value, field]) => ({ value, label: field.label }));
  const comparedFields = availableFields.filter(([key, field]) => field.kind === 'number' && field.unit === definition.unit && (!condition.operator.startsWith('cross') || field.series && (!capabilities || capabilities.technical.includes(key)))).map(([value, field]) => ({ value, label: field.label }));
  const operators = monthlyOperators(condition.field).filter(operator => !capabilities || capabilities.technical.includes(condition.field) || !['crossAbove', 'crossBelow', 'increasing', 'decreasing'].includes(operator));
  const changeOperator = (operator: MonthlyOperator) => {
    if (isDistance(operator)) setValue(`${path}.operand`, 'field', { shouldDirty: true });
    if (['is', 'isNot'].includes(operator)) setValue(`${path}.choices`, condition.choices.slice(0, 1), { shouldDirty: true });
  };
  return <div className="monthly-condition" aria-label={`Monthly condition ${index + 1} in group ${group + 1}`}>
    <div className="monthly-condition-category"><span className="condition-number">{index + 1}</span><RhfSelect control={control} name={`${path}.category`} label="Category" options={categories} onSelect={(value) => { const first = availableFields.find(([, field]) => field.category === value)![0]; setValue(path, newMonthlyCondition(first), { shouldDirty: true, shouldValidate: true }); }} /></div>
    <RhfSelect control={control} name={`${path}.field`} label="Monthly field" showSearch optionFilterProp="label" virtual={false} options={fields} onSelect={(value) => setValue(path, newMonthlyCondition(value), { shouldDirty: true, shouldValidate: true })} />
    <RhfSelect control={control} name={`${path}.operator`} label="Operator" options={operators.map((value) => ({ value, label: monthlyOperatorLabels[value] }))} onSelect={changeOperator} />
    <div className={`monthly-condition-value${numeric && !trend && !range && !distance ? ' monthly-numeric-value' : ''}`}>
      {numeric ? trend ? <RhfInputNumber control={control} name={`${path}.lookback`} label="Consecutive months" min={1} max={24} /> : range ? <div className="monthly-value-pair"><RhfInputNumber control={control} name={`${path}.value`} label={`From (${definition.unit})`} /><RhfInputNumber control={control} name={`${path}.upper`} label={`To (${definition.unit})`} /></div> : <>
        {!distance && <RhfSelect control={control} name={`${path}.operand`} label="Compare with" options={[{ value: 'value', label: 'Value' }, { value: 'field', label: 'Monthly field' }]} />}
        {condition.operand === 'field' || distance ? <><RhfSelect control={control} name={`${path}.compareField`} label="Compared monthly field" options={comparedFields} showSearch optionFilterProp="label" virtual={false} /><div className="monthly-value-pair"><RhfInputNumber control={control} name={`${path}.multiplier`} label="Multiplier ×" min={0.01} max={100} step={0.1} />{distance && <RhfInputNumber control={control} name={`${path}.distance`} label="Distance (%)" min={0} max={100} />}</div></> : <RhfInputNumber control={control} name={`${path}.value`} label={`Value (${definition.unit})`} />}
        {condition.operator.startsWith('cross') && <RhfInputNumber control={control} name={`${path}.lookback`} label="Within last N months" min={1} max={24} />}
      </> : definition.kind === 'text' ? <RhfInput control={control} name={`${path}.text`} label="Keyword or phrase" placeholder="e.g. Order win" /> : <><RhfChoiceSelect control={control} name={`${path}.choices`} label="Match value" multiple={['in', 'notIn'].includes(condition.operator)} options={capabilities?.choices[condition.field] ?? definition.choices} />{condition.category === 'patterns' && <RhfInputNumber control={control} name={`${path}.lookback`} label="Within last N monthly candles" min={1} max={24} />}</>}
    </div>
    <Button className="monthly-condition-delete" type="text" size="small" aria-label={`Remove monthly condition ${index + 1} from group ${group + 1}`} disabled={!canRemove} onClick={onRemove} icon={<DeleteOutlined />} />
  </div>;
}
function MonthlyConditionList({ index }: { index: number }) {
  const { control } = useFormContext<MonthlyRuleDefinition>();
  const { fields, append, remove } = useFieldArray({ control, name: `groups.${index}.conditions` });
  return <section className="condition-group monthly-condition-group" aria-label="Monthly conditions">
    <header><div><strong>Conditions</strong><Tag>MONTHLY</Tag></div><RhfSelect control={control} name={`groups.${index}.logic`} label="Match conditions" options={[{ value: 'AND', label: 'All · AND' }, { value: 'OR', label: 'Any · OR' }]} /></header>
    {fields.map((field, ci) => <MonthlyConditionRow key={field.id} group={index} index={ci} onRemove={() => remove(ci)} canRemove={fields.length > 1} />)}
    <Button type="text" size="small" icon={<PlusOutlined aria-hidden />} disabled={fields.length >= 12} onClick={() => append(newMonthlyCondition())}>Add condition</Button>
  </section>;
}
export function MonthlyConditionEditor({ capabilities }: { capabilities?: RuleCapabilities }) {
  const { control } = useFormContext<MonthlyRuleDefinition>();
  const groups = useWatch({ control, name: 'groups' });
  const logic = useWatch({ control, name: 'logic' });
  return <CapabilitiesContext.Provider value={capabilities}><div className="monthly-condition-editor">
    {groups.length > 1 && <p className="monthly-legacy-logic">This earlier saved rule combines its condition lists with {logic}. Existing logic is preserved.</p>}
    {groups.map((_, index) => <MonthlyConditionList key={index} index={index} />)}
  </div></CapabilitiesContext.Provider>;
}
