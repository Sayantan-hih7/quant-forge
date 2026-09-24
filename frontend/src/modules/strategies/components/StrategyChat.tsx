import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Tag } from 'antd';
import { ArrowUpOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RhfTextArea } from '../../../components/forms';
import { strategyPromptSchema, tradingPlanSchema } from '../schemas/tradingPlanSchema';
import { strategyRefinements, strategyStarters } from '../config/assistantPrompts';
import { useAiAssistant } from '../../../hooks/useAiAssistant';
import type { StrategyMessage, TradingPlanDraft } from '../types/tradingPlan';

export function StrategyChat({ messages, draft, onUpdate, onBusyChange, active = true }: { messages: StrategyMessage[]; draft?: TradingPlanDraft; onUpdate: (messages: StrategyMessage[], draft?: TradingPlanDraft) => void; onBusyChange: (busy: boolean) => void; active?: boolean }) {
  const form = useForm<{ prompt: string }>({ resolver: zodResolver(strategyPromptSchema), defaultValues: { prompt: '' } });
  const assistant = useAiAssistant();
  const { busy, cancel } = assistant;
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [retained, setRetained] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, busy]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => { if (!active) cancel(); }, [active, cancel]);
  const send = async ({ prompt }: { prompt: string }) => {
    if (busy) return;
    const next: StrategyMessage[] = [...messages, { id: crypto.randomUUID(), role: 'user', text: prompt }];
    onUpdate(next); setRetained(false);
    const reply = await assistant.send({ scope: 'strategy', prompt, messages, currentDraft: draft }, value => tradingPlanSchema.parse(value));
    if (reply) {
      onUpdate([...next, { id: crypto.randomUUID(), role: 'assistant' as const, text: reply.text }].slice(-40), reply.proposal ?? undefined);
      if (reply.proposal) setAssumptions(reply.assumptions);
      setRetained(!reply.proposal); form.reset();
    }
  };
  return <section className="strategy-chat" aria-label="Strategy assistant"><header className="strategy-chat-header"><span className="strategy-assistant-icon"><RobotOutlined /></span><div><h2>Build with AI</h2><p>Describe your idea. Shape both sides of the trade.</p></div><Tag>Gemini</Tag></header>
    {assistant.status?.configured === false && <Alert type="warning" showIcon title="AI is not configured" description="Add GEMINI_API_KEY to backend/.env and restart the API." />}
    {assistant.error && <Alert type="error" showIcon title="AI request failed" description={assistant.error} />}
    {(retained || assistant.error) && <p className="strategy-demo-note">Your existing draft and any previous suggestion are preserved.</p>}
    <div className="strategy-chat-log" role="log" aria-label="Strategy conversation" aria-live="polite" ref={log}>
      <div className="strategy-chat-welcome"><span className="strategy-eyebrow">FROM IDEA TO TRADING RULES</span><h3>What should your strategy do?</h3><p>Tell the assistant when you want to buy, when you want to sell, and how much risk to take.</p><div className="strategy-demo-note">Gemini proposes editable conditions. Review the buy rules, sell rules and any assumptions before applying.</div></div>
      {messages.map((item) => <div className={`strategy-message ${item.role}`} key={item.id}><span className="strategy-message-avatar">{item.role === 'assistant' ? <RobotOutlined /> : <UserOutlined />}</span><div><strong>{item.role === 'assistant' ? 'Gemini assistant' : 'You'}</strong><p>{item.text}</p></div></div>)}
      {busy && <div className="strategy-thinking" role="status">Drafting and validating your strategy…</div>}
      {assumptions.length > 0 && <div className="strategy-chat-welcome"><strong>Assumptions to review</strong><ul>{assumptions.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
    </div>
    <div className="strategy-chat-suggestions"><span>{draft ? 'Explore another approach' : 'Start an idea'}</span><div>{strategyStarters.map((item) => <Button key={item.label} size="small" disabled={busy || assistant.status?.configured === false} onClick={() => { void send({ prompt: item.prompt }); }}>{item.label}</Button>)}</div>{draft && <><span>Refine the draft</span><div>{strategyRefinements.map((prompt) => <Button key={prompt} size="small" disabled={busy || assistant.status?.configured === false} onClick={() => { void send({ prompt }); }}>{prompt.replace('Set ', '')}</Button>)}</div></>}</div>
    <Form className="strategy-chat-composer" layout="vertical" onFinish={() => { void form.handleSubmit(send)(); }} requiredMark={false}><RhfTextArea control={form.control} name="prompt" label="Message the strategy assistant" placeholder="Describe an idea or ask to refine the draft…" autoSize={{ minRows: 2, maxRows: 5 }} maxLength={1200} disabled={busy} /><div><span>Apply suggestions to the builder when ready.</span>{busy ? <Button onClick={assistant.cancel}>Stop generating</Button> : <Button type="primary" htmlType="submit" icon={<ArrowUpOutlined aria-hidden />} disabled={assistant.status?.configured === false}>Send</Button>}</div></Form>
  </section>;
}
