import { Button, Form } from 'antd';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { RhfAutoComplete } from '../../../components/forms';
import type { AiQuestion } from '../../../services/aiAssistant';

export function AssistantQuestions({ questions, busy, onAnswer }: { questions: AiQuestion[]; busy: boolean; onAnswer: (text: string) => void }) {
  const schema = z.object({ answers: z.record(z.string().trim().max(250)) }).superRefine(({ answers }, ctx) => {
    questions.forEach((_, i) => { if (!answers[String(i)]) ctx.addIssue({ code: 'custom', path: ['answers', String(i)], message: 'Choose an answer or write your own.' }); });
  });
  const form = useForm<{ answers: Record<string, string> }>({ resolver: zodResolver(schema), defaultValues: { answers: {} } });
  return <section className="assistant-questions" aria-label="Questions to complete your plan">
    <h3>A few details to get this right</h3><p>Choose a suggestion or type your own answer. You can also reply in chat below.</p>
    <Form layout="vertical" requiredMark={false} disabled={busy} onFinish={() => void form.handleSubmit(({ answers }) => onAnswer('My answers to your latest questions, in order:\n' + questions.map((_, i) => `${i + 1}. ${answers[String(i)]}`).join('\n')))()}>
      {questions.map((question, index) => <div key={index}>
        <RhfAutoComplete control={form.control} name={`answers.${index}`} label={question.question} options={question.options.map(value => ({ value }))} placeholder="Choose or type an answer" filterOption={false} />
        <p className="muted assistant-question-reason">{question.reason}</p>
      </div>)}
      <Button type="primary" htmlType="submit" loading={busy}>Continue with my answers</Button>
    </Form>
  </section>;
}
