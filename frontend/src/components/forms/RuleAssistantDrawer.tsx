import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Button, Drawer, Form, Space, Tag } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RhfTextArea } from './RhfTextArea';
import '../../styles/strategy-studio.css';
import { useAiAssistant } from '../../hooks/useAiAssistant';
import type { AiMessage } from '../../services/aiAssistant';

const promptSchema = z.object({ prompt: z.string().trim().min(3, 'Describe the rule you want').max(1200) });
interface Props<T> {
  open: boolean; onClose: () => void; title: string;
  starters: { label: string; prompt: string }[];
  currentDraft: T; validate: (value: unknown) => T;
  preview: (proposal: T) => ReactNode; onApply: (proposal: T) => void;
}

/** Optional rule drafting. Applying never saves a rule or starts a scan. */
export function RuleAssistantDrawer<T extends object>({ open, onClose, title, starters, currentDraft, validate, preview, onApply }: Props<T>) {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [proposal, setProposal] = useState<T>();
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [previousSuggestion, setPreviousSuggestion] = useState(false);
  const assistant = useAiAssistant();
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, assistant.busy]);
  const form = useForm<{ prompt: string }>({ resolver: zodResolver(promptSchema), defaultValues: { prompt: '' } });
  const send = async ({ prompt }: { prompt: string }) => {
    if (assistant.busy) return;
    const next: AiMessage[] = [...messages, { role: 'user', text: prompt }];
    const context = proposal ?? currentDraft;
    setMessages(next); setPreviousSuggestion(!!proposal);
    const response = await assistant.send({ scope: 'monthly', prompt, messages, currentDraft: context }, validate);
    if (!response) return;
    setMessages([...next, { role: 'assistant' as const, text: response.text }].slice(-20));
    if (response.proposal) { setProposal(response.proposal); setAssumptions(response.assumptions); setPreviousSuggestion(false); }
    form.reset();
  };
  const close = () => { assistant.cancel(); onClose(); };
  return <Drawer className="strategy-ai-drawer" title={title} open={open} onClose={close} size={1040} footer={<div className="strategy-ai-footer"><span>Applying replaces the draft. Review and save it separately.</span><Button onClick={close}>Back to builder</Button><Button type="primary" disabled={!proposal || assistant.busy} onClick={() => { if (proposal) { onApply(proposal); setProposal(undefined); close(); } }}>Apply to builder</Button></div>}>
    {assistant.status?.configured === false && <Alert className="mb-5" type="warning" showIcon title="AI is not configured" description="Add GEMINI_API_KEY to backend/.env and restart the API." />}
    {assistant.error && <Alert className="mb-5" type="error" showIcon title="AI request failed" description={assistant.error} />}
    <div className="strategy-ai-layout"><section className="strategy-chat" aria-label="Monthly rule assistant">
      <header className="strategy-chat-header"><span className="strategy-assistant-icon"><RobotOutlined /></span><div><h2>Build with AI</h2><p>Describe which stocks should qualify each month.</p></div><Tag>Gemini</Tag></header>
      <div className="strategy-chat-log" role="log" aria-label="Monthly rule conversation" aria-live="polite" ref={log}>
        {!messages.length && <div className="strategy-chat-welcome"><h3>Start with your stock-selection idea</h3><p>Use monthly trend, liquidity, ownership and company filters. Trading entry and exit rules belong in Algo Strategies.</p></div>}
        {messages.map((item, index) => <div className={`strategy-message ${item.role}`} key={index}><div><strong>{item.role === 'user' ? 'You' : 'Gemini assistant'}</strong><p>{item.text}</p></div></div>)}
        {assistant.busy && <p role="status" className="strategy-thinking">Drafting and validating monthly conditions…</p>}
      </div>
      <div className="strategy-chat-suggestions"><span>Start an idea</span><Space wrap>{starters.map(item => <Button key={item.label} size="small" disabled={assistant.busy || assistant.status?.configured === false} onClick={() => { void send({ prompt: item.prompt }); }}>{item.label}</Button>)}</Space></div>
      <Form className="strategy-chat-composer" layout="vertical" requiredMark={false} onFinish={form.handleSubmit(send)}>
        <RhfTextArea control={form.control} name="prompt" label="Message the monthly assistant" placeholder="Describe a rule, or ask to refine the proposal…" autoSize={{ minRows: 3, maxRows: 5 }} maxLength={1200} disabled={assistant.busy} />
        <div><span>Monthly qualification only</span>{assistant.busy ? <Button onClick={assistant.cancel}>Stop generating</Button> : <Button type="primary" htmlType="submit" disabled={assistant.status?.configured === false}>Send</Button>}</div>
      </Form>
    </section><section className="strategy-preview" aria-label="Monthly suggestion preview"><div className="strategy-preview-heading"><span>PROPOSED MONTHLY RULE</span><small>{previousSuggestion && proposal ? 'Previous suggestion retained' : 'Not applied yet'}</small></div><div className="strategy-preview-body">{proposal ? preview(proposal) : <p className="muted">Your proposed conditions will appear here for review.</p>}{assumptions.length > 0 && <div><strong>Assumptions to review</strong><ul>{assumptions.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}</div></section></div>
  </Drawer>;
}
