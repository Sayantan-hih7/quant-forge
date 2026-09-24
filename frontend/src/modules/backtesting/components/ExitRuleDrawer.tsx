import { Button, Drawer, Form, Alert } from "antd";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RhfInput } from "../../../components/forms";
import { ConditionGroupsEditor } from "../../qualification/components/ConditionGroupsEditor";
import { ruleSchema } from "../../qualification/schemas/ruleSchema";
import type { RuleDefinition, RuleTemplate } from "../../qualification/types";
import "../../../styles/qualification.css";

export function ExitRuleDrawer({
  rule,
  onClose,
  onSave,
}: {
  rule: RuleTemplate;
  onClose: () => void;
  onSave: (rule: RuleDefinition) => void;
}) {
  const form = useForm<RuleDefinition>({
    resolver: zodResolver(ruleSchema),
    defaultValues: rule,
  });
  return (
    <Drawer
      open
      title="Sell exit rules"
      size={920}
      onClose={onClose}
      footer={
        <div className="bt-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" onClick={form.handleSubmit(onSave)}>
            Save exit rule
          </Button>
        </div>
      }
    >
      <Alert
        type="info"
        showIcon
        title="Sell closes an existing long position"
        description="These conditions compete with the stop-loss, target, and session close. The first applicable exit closes the position. No short position is opened."
      />
      <FormProvider {...form}>
        <Form layout="vertical" className="bt-exit-editor" requiredMark={false}>
          <RhfInput control={form.control} name="name" label="Exit rule name" />
          <ConditionGroupsEditor tier="tactical" />
        </Form>
      </FormProvider>
    </Drawer>
  );
}
