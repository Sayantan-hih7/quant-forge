import { RequestFeedback } from '../../../components/feedback/RequestFeedback';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Tag } from 'antd';
import { ArrowUpOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RhfTextArea } from '../../../components/forms';
import { strategyPromptSchema, tradingPlanSchema, strategyRiskSchema } from '../schemas/tradingPlanSchema';
import { strategyRefinements, strategyStarters } from '../config/assistantPrompts';
import { useAiAssistant } from '../../../hooks/useAiAssistant';
import type { StrategyMessage, TradingPlanDraft } from '../types/tradingPlan';
import type { AiExample } from '../../../services/aiAssistant';
import type { StrategySuggestionMeta } from '../store/strategyChatStore';
import { AssistantQuestions } from './AssistantQuestions';
import { riskStarters } from '../config/assistantPrompts';

export function StrategyChat({ messages, draft, onUpdate, onBusyChange, active = true, focus, example }: { messages: StrategyMessage[]; draft?: TradingPlanDraft; onUpdate: (messages: StrategyMessage[], draft?: TradingPlanDraft, meta?: StrategySuggestionMeta) => void; onBusyChange: (busy: boolean) => void; active?: boolean; focus?: 'risk'; example?: AiExample }) {
  const form = useForm<{ prompt: string }>({ resolver: zodResolver(strategyPromptSchema), defaultValues: { prompt: '' } });
  const assistant = useAiAssistant();
  const { busy, cancel } = assistant;
  const [retained, setRetained] = useState(false);
  const lastReply = messages.findLast(item => item.role === 'assistant');
  const lastDecision = messages.findLast(item => item.role === 'assistant' && !item.explanationOnly);
  const pendingQuestions = lastDecision?.questions ?? [];
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, busy]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => { if (!active) cancel(); }, [active, cancel]);
  const send = async ({ prompt }: { prompt: string }) => {
    if (busy) return;
    const next: StrategyMessage[] = [...messages, { id: crypto.randomUUID(), role: 'user', text: prompt }];
    onUpdate(next); setRetained(false);
    const reply = await assistant.send({ scope: 'strategy', focus, example, prompt, messages, currentDraft: draft }, value => {
      if (focus === 'risk' && draft) return { ...draft, risk: strategyRiskSchema.parse((value as { risk?: unknown })?.risk) };
      return tradingPlanSchema.parse(value);
    });
    if (reply) {
      onUpdate([...next, { id: crypto.randomUUID(), role: 'assistant' as const, text: reply.text, questions: reply.questions, blockers: reply.blockers, assumptions: reply.assumptions, explanationOnly: reply.explanationOnly }].slice(-40), reply.proposal ?? undefined,
        reply.explanationOnly ? undefined : { awaitingReply: !reply.proposal, example: reply.example, assumptions: reply.assumptions });
      setRetained(!reply.proposal); form.reset();
    }
  };
  return <section className="strategy-chat" aria-label="Strategy assistant"><header className="strategy-chat-header"><span className="strategy-assistant-icon"><RobotOutlined /></span><div><h2>{focus === 'risk' ? 'Set risk in your own words' : 'Build with AI'}</h2><p>{focus === 'risk' ? 'Describe an example. We’ll map it to the controls.' : 'Describe your idea. Shape both sides of the trade.'}</p></div><Tag>{assistant.status?.provider ?? "AI"}</Tag></header>
    {assistant.status?.configured === false && <Alert type="warning" showIcon title="AI is not configured" description="Ask the workspace owner to connect the AI service. You can continue using the manual builder." />}
    {assistant.error && <RequestFeedback type="error" showIcon title="AI request failed" description={assistant.error} />}
    {(retained || assistant.error) && <p className="strategy-demo-note">Your existing draft and any previous suggestion are preserved.</p>}
    <div className="strategy-chat-log" role="log" aria-label="Strategy conversation" aria-live="polite" ref={log}>
      <div className="strategy-chat-welcome"><span className="strategy-eyebrow">DESCRIBE → CLARIFY → REVIEW → APPLY</span><h3>{focus === 'risk' ? 'How would you manage this trade?' : 'What should your strategy do?'}</h3><p>{focus === 'risk' ? 'For example: “If I buy at ₹100, protect me at ₹96. Sell half at twice that risk, then the rest at four times. Move my stop to entry after the first sale.” Tell us whether prices are examples or actual limits.' : 'Explain when you buy and sell, or describe a trade you already understand. The assistant will ask only for details needed to express it in supported rules.'}</p><div className="strategy-demo-note">{focus === 'risk' ? 'Only risk settings are proposed here. Your buy and sell conditions stay in the manual builder.' : 'You can describe the idea without indicator names. Missing decisions are clarified before a suggestion is ready.'}</div></div>
      {messages.map((item) => <div className={`strategy-message ${item.role}`} key={item.id}><span className="strategy-message-avatar">{item.role === 'assistant' ? <RobotOutlined /> : <UserOutlined />}</span><div><strong>{item.role === 'assistant' ? 'QuantForge assistant' : 'You'}</strong><p>{item.text}</p></div></div>)}
      {busy && <div className="strategy-thinking" role="status">Drafting and validating your strategy…</div>}
      {!!lastReply?.blockers?.length && <Alert showIcon type="warning" title="What is needed to complete this idea" description={<ul>{lastReply.blockers.map((item, i) => <li key={i}>{item}</li>)}</ul>} />}
      {!!lastReply?.assumptions?.length && <div className="strategy-chat-welcome"><strong>Assumptions to review</strong><ul>{lastReply.assumptions.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
    </div>
    {!!pendingQuestions.length && <AssistantQuestions key={lastDecision!.id} questions={pendingQuestions} busy={busy || assistant.status?.configured === false} onAnswer={prompt => void send({ prompt })} />}
    {!pendingQuestions.length && <div className="strategy-chat-suggestions"><span>{focus === 'risk' ? 'Need a starting point?' : draft ? 'Explore another approach' : 'Start an idea'}</span><div>{(focus === 'risk' ? riskStarters : strategyStarters).map((item) => <Button key={item.label} size="small" disabled={busy || assistant.status?.configured === false} onClick={() => { void send({ prompt: item.prompt }); }}>{item.label}</Button>)}</div>{draft && focus !== 'risk' && <><span>Refine the draft</span><div>{strategyRefinements.map((prompt) => <Button key={prompt} size="small" disabled={busy || assistant.status?.configured === false} onClick={() => { void send({ prompt }); }}>{prompt.replace('Set ', '')}</Button>)}</div></>}</div>}
    <Form className="strategy-chat-composer" layout="vertical" onFinish={() => { void form.handleSubmit(send)(); }} requiredMark={false}><RhfTextArea control={form.control} name="prompt" label="Message the strategy assistant" placeholder="Describe an idea or ask to refine the draft…" autoSize={{ minRows: 2, maxRows: 5 }} maxLength={1200} disabled={busy} /><div><span>Apply suggestions to the builder when ready.</span>{busy ? <Button onClick={assistant.cancel}>Stop generating</Button> : <Button type="primary" htmlType="submit" icon={<ArrowUpOutlined aria-hidden />} disabled={assistant.status?.configured === false}>Send</Button>}</div></Form>
  </section>;
}
