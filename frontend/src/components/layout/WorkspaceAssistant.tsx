import type {QualificationChatState} from './AssistantQualificationRun';
import AssistantComposerInput from './AssistantComposerInput';
import AssistantMarkdown from './AssistantMarkdown';
import { AssistantLoading } from './AssistantLoading';
import { VoiceWaveform } from './VoiceWaveform';
import AssistantAnswer from './AssistantAnswer';
import {useAssistantHistory} from '../../hooks/useAssistantHistory';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Space, Collapse, Modal, Tabs, Tag, Dropdown, Tooltip, Drawer, Progress } from 'antd';
import { RobotOutlined, ArrowUpOutlined, PlusOutlined, SafetyCertificateOutlined, ThunderboltOutlined, BulbOutlined, PaperClipOutlined, AudioOutlined, StopOutlined, CloseOutlined, HistoryOutlined } from '@ant-design/icons';
import '../../styles/strategy-studio.css';
import '../../styles/assistant.css';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiClient } from '../../services/apiClient';
import {aiQuestionsSchema,serializeAiMessage,agentActivitySchema} from '../../services/aiAssistant';
import {AssistantQuestions,type QuestionProgress} from '../../modules/strategies/components/AssistantQuestions';
import {useVoiceDictation} from '../../hooks/useVoiceDictation';
import {readAssistantAttachment,attachmentBytes,type AssistantAttachment} from '../../services/assistantAttachments';
import type { AiMessage, AiQuestion, AgentActivity } from '../../services/aiAssistant';
import { tradingPlanSchema } from '../../modules/strategies/schemas/tradingPlanSchema';
import type { TradingPlanDraft } from '../../modules/strategies/types/tradingPlan';
import { StrategyDraftPreview } from '../../modules/strategies/components/StrategyDraftPreview';
import { useBackendStrategies } from '../../modules/strategies/hooks/useBackendStrategies';
import { strategyChanges } from '../../modules/strategies/utils/strategyChanges';
import { createMonthlyRuleSchema } from '../../modules/qualification/schemas/monthlyRuleSchema';
import { MonthlyRuleSummary } from '../../modules/qualification/components/MonthlyRuleSummary';
import type { MonthlyRuleDefinition } from '../../modules/qualification/types/monthly';
import type { RuleCapabilities } from '../../modules/qualification/types/backend';

const AssistantQualificationRun = lazy(() => import('./AssistantQualificationRun'));

const AssistantBacktestRun = lazy(() => import('./AssistantBacktestRun'));
import type {BacktestChatState,AssistantWorkflow} from './AssistantBacktestRun';

type Draft = TradingPlanDraft | MonthlyRuleDefinition;
interface Task { scope: 'strategy' | 'monthly'; id: string; revision: number }
interface Review { blocked: boolean; issues: { severity: string; title: string; explanation: string; recommendation: string }[] }
interface Reply { memory?:string; clearWorkflow?:boolean; workflow?:AssistantWorkflow; activity?:AgentActivity[]; text: string; task: Task | null; questions: AiQuestion[]; assumptions: string[]; blockers: string[]; proposal: Draft | null; baseline: Draft | null; review: Review | null; destination: string | null }
const allowedDestinations = new Set(['/strategies?tab=backtests', '/signal-runner', '/paper-trading', '/data-sources']);
const isStrategy = (draft: Draft): draft is TradingPlanDraft => 'entry' in draft;
function DraftSummary({ draft, saved = false }: { draft: Draft; saved?: boolean }) {
  return isStrategy(draft) ? <StrategyDraftPreview draft={draft} changed={!saved} saved={saved} /> : <MonthlyRuleSummary rule={draft} />;
}
function ArchivedReply({item}:{item:AiMessage}) {
 const data=item.presentation;
 const proposal=data?.proposal;
 const parsed=tradingPlanSchema.safeParse(proposal);
 return <>{!!item.questions?.length&&<details><summary>Questions asked</summary>{item.questions.map(q=><section key={q.id}><strong>{q.question}</strong><p>{q.reason}</p><ul>{q.options.map(option=><li key={option}>{option}{q.recommendedOption===option?' (recommended)':''}</li>)}</ul></section>)}</details>}
 {data&&!!(proposal||data.review||data.assumptions)&&<details><summary>Proposal & review at this point</summary><p>Historical snapshot. Later messages may change or save these rules.</p>{parsed.success?<DraftSummary draft={parsed.data}/>:proposal?<pre style={{maxHeight:320,overflow:'auto'}}>{JSON.stringify(proposal,null,2)}</pre>:null}{Array.isArray(data.assumptions)&&<ul>{data.assumptions.map((a,i)=><li key={i}>{String(a)}</li>)}</ul>}{!!data.review&&<pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(data.review,null,2)}</pre>}</details>}</>;
}
export function WorkspaceAssistant({ active = true }: { active?: boolean }) {
  const [historyOpen,setHistoryOpen]=useState(false),[historySearch,setHistorySearch]=useState('');
  const [prompt, setPrompt] = useState('');
  const [workflow,setWorkflow]=useState<AssistantWorkflow>();
  const [backtestState,setBacktestState]=useState<BacktestChatState>();
  const [qualificationState,setQualificationState]=useState<QualificationChatState>();
  const [attachments,setAttachments]=useState<AssistantAttachment[]>([]),[readingFile,setReadingFile]=useState(false),[draftNeedsRefresh,setDraftNeedsRefresh]=useState(false);
  const fileInput=useRef<HTMLInputElement>(null),fileReadLock=useRef(false);
  const [previewText,setPreviewText]=useState<{name:string;text:string}>();
  const [pasteOpen,setPasteOpen]=useState(false),[pastedNote,setPastedNote]=useState('');
  const chooseFile=(accept:string)=>{if(fileInput.current){fileInput.current.accept=accept;fileInput.current.click();}};
  const voice=useVoiceDictation(setPrompt,active);
  const [messages, setMessages] = useState<AiMessage[]>([]), [reply, setReply] = useState<Reply>();
  const [task, setTask] = useState<Task>(), [currentDraft, setCurrentDraft] = useState<Draft>();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false), [saving, setSaving] = useState(false), [savedMessage, setSavedMessage] = useState('');
  const [questionState,setQuestionState]=useState<QuestionProgress>();
  const history=useAssistantHistory({messages,task,currentDraft,resume:{error,qualificationState,workflow,backtestState,attachments,savedMessage,reply:reply?{...reply}:undefined,reviewOpen,prompt,questionState}});
  const controller = useRef<AbortController | null>(null), saveLock = useRef(false);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<import('antd/es/input/TextArea').TextAreaRef>(null);
  const location = useLocation(), navigate = useNavigate();
  useEffect(() => () => controller.current?.abort(), []);
  // The previous preferences field is retired; do not retain or send its notes.
  useEffect(() => { try { localStorage.removeItem('quantforge-assistant-preferences'); } catch { /* Storage may be unavailable. */ } }, []);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [messages, busy]);
  const cancel = () => { controller.current?.abort(); controller.current = null; setBusy(false); };
  const addFile=async(file:File)=>{
    if(fileReadLock.current||busy||saving)return false;
    fileReadLock.current=true;setReadingFile(true);setError('');
    try{if(attachments.length>=2)throw new Error('Attach up to two files. Remove one first.');const next=await readAssistantAttachment(file);if(attachments.reduce((n,f)=>n+attachmentBytes(f),attachmentBytes(next))>2*1024*1024)throw new Error('Attachments together must be up to 2 MB.');if(new TextEncoder().encode(JSON.stringify({messages,currentDraft,reply,attachments:[...attachments,next,next]})).byteLength>7*1024*1024)throw new Error('This chat is near its attachment storage limit. Start a new conversation before adding more files.');setAttachments(previous=>[...previous,next]);return true;}
    catch(e){setError(e instanceof Error?e.message:'Could not read this file.');return false;}finally{fileReadLock.current=false;setReadingFile(false);if(fileInput.current)fileInput.current.value='';}
  };
  const send = async (answer?:string) => {
    const outgoing=answer??(prompt.trim()||(attachments.length?'Help me understand the attached idea and prepare a paper-trading plan. Ask only what is missing.':''));
    if (busy || saving || history.loading || readingFile || voice.listening || outgoing.trim().length < 3) return;
    const abort = new AbortController(); controller.current = abort;
    const text = outgoing.trim(), contextHistory = messages.slice(-10);
    const newAttachments=attachments.filter(file=>!messages.some(message=>message.attachments?.some(saved=>JSON.stringify(saved)===JSON.stringify(file))));
    setMessages([...messages, { role: 'user', text, attachments:newAttachments.length?newAttachments:undefined }]); setPrompt(''); setBusy(true); setError(''); setDraftNeedsRefresh(true); setReviewOpen(false); setSavedMessage('');
    try {
      const historySaved=await history.flush().then(()=>true,()=>false);
      const { data } = await apiClient.post<Reply>('/ai/chat', { prompt: text, conversationId:historySaved?history.id:undefined, messages: contextHistory.map(serializeAiMessage), attachments, page: location.pathname, task, currentDraft, activeWorkflow:workflow?{kind:workflow.kind,strategyId:workflow.strategyId,revision:workflow.revision}:undefined }, { signal: abort.signal, timeout: 270000 });
      if (abort.signal.aborted) return;
      let proposal: Draft | null = null, baseline: Draft | null = null;
      if (data.proposal) {
        if (!data.task || !data.review || !Array.isArray(data.review.issues) || typeof data.review.blocked !== 'boolean') throw new Error('The draft review is incomplete. Ask the assistant to retry.');
        if (data.task.scope === 'strategy') {
          proposal = tradingPlanSchema.parse(data.proposal);
          const before = tradingPlanSchema.safeParse(data.baseline); baseline = before.success ? before.data : null;
        } else {
          const { data: capabilities } = await apiClient.get<RuleCapabilities>('/market-data/capabilities', { signal: abort.signal });
          const schema = createMonthlyRuleSchema(capabilities.choices);
          proposal = schema.parse(data.proposal);
          const before = schema.safeParse(data.baseline); baseline = before.success ? before.data : null;
        }
      }
      if (abort.signal.aborted) return;
      const sameTask = task?.id === data.task?.id && task?.scope === data.task?.scope;
      setTask(data.task ?? undefined);
      if (proposal) setCurrentDraft(proposal); else if (!sameTask||data.workflow) setCurrentDraft(undefined);
      const questions = aiQuestionsSchema.parse(data.questions ?? []);
      setDraftNeedsRefresh(false);
      if(data.workflow){setWorkflow(data.workflow);setBacktestState(undefined);}
      else if(data.clearWorkflow||proposal||questions.length)setWorkflow(undefined);
      const activity=agentActivitySchema.parse(data.activity??[]);
      setQuestionState(undefined); setReply({ ...data, activity, questions, proposal, baseline }); setMessages([...messages, { role: 'user', text, attachments:newAttachments.length?newAttachments:undefined }, { role: 'assistant', text: data.text, questions, activity, presentation:{...data,questions,proposal,baseline} }]);
    } catch (e) { if (!abort.signal.aborted) { setReply(undefined); const failure=e instanceof Error ? e.message : 'Request failed. Please retry.';setError(failure);setMessages(previous=>[...previous,{role:'assistant',text:`Request could not be completed: ${failure}`}]); } }
    finally { if (controller.current === abort) { controller.current = null; setBusy(false); } }
  };
  const ready = !draftNeedsRefresh && !!reply?.proposal && !!reply.task && !!reply.review && !reply.review.blocked && !reply.questions?.length && !reply.blockers?.length;
  const save = async () => {
    if (!ready || !reply?.proposal || !reply.task || saveLock.current) return;
    saveLock.current = true; setSaving(true); setError('');
    const target = reply.task, draft = reply.proposal;
    try {
      const { data } = target.scope === 'monthly'
        ? await apiClient.put<{ revision: number }>('/qualification/rule', { rule: draft, expectedRevision: target.revision })
        : await apiClient.put<{ revision: number }>(`/strategies/${target.id}`, { draft, expectedRevision: target.revision });
      if (!Number.isInteger(data.revision) || data.revision < target.revision) throw new Error('Could not confirm the saved revision. Check the saved rule before retrying.');
      const savedTask = { ...target, revision: data.revision };
      const text = `${target.scope === 'monthly' ? 'Qualification rule' : (draft as TradingPlanDraft).name} saved as revision ${data.revision}. ${target.scope === 'monthly' ? 'Your published stocks are unchanged until a scan is reviewed and published.' : 'Existing paper sessions keep their saved rules. Saving does not start trading.'}`;
      setTask(savedTask); setCurrentDraft(draft); setReply(undefined); setReviewOpen(false); setSavedMessage(text);
      setMessages(previous => [...previous, { role: 'assistant' as const, text }]);
      if (target.scope === 'strategy') void useBackendStrategies.getState().refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed. The draft is retained.'); }
    finally { saveLock.current = false; setSaving(false); }
  };
  const clearChat = () => { setPrompt('');setQuestionState(undefined); setWorkflow(undefined);setBacktestState(undefined);setQualificationState(undefined); voice.cancel();setPreviewText(undefined);setPasteOpen(false);setPastedNote('');setAttachments([]);setDraftNeedsRefresh(false);setMessages([]); setReply(undefined); setCurrentDraft(undefined); setTask(undefined); setError(''); setSavedMessage(''); setReviewOpen(false); };
  const reset=async()=>{try{await history.fresh();clearChat();}catch(e){setError(e instanceof Error?e.message:'Could not save this chat');}};
  const openChat=async(id:string)=>{try{
    const snapshot=await history.open(id);clearChat();setMessages(snapshot.messages);setTask(snapshot.task);
    setError(snapshot.resume?.error??(snapshot.messages.at(-1)?.role==='user'?'The previous reply did not finish. You can continue from your last message.':''));setQualificationState(snapshot.resume?.qualificationState);setWorkflow(snapshot.resume?.workflow);setBacktestState(snapshot.resume?.backtestState);setAttachments(snapshot.resume?.attachments??[]);setSavedMessage(snapshot.resume?.savedMessage??'');setPrompt(snapshot.resume?.prompt??'');setQuestionState(snapshot.resume?.questionState);
    if(snapshot.currentDraft&&snapshot.task?.scope==='strategy'){const parsed=tradingPlanSchema.safeParse(snapshot.currentDraft);if(parsed.success)setCurrentDraft(parsed.data);}
    else if(snapshot.currentDraft&&snapshot.task?.scope==='monthly')setCurrentDraft(snapshot.currentDraft as MonthlyRuleDefinition);
    const last=snapshot.messages.at(-1);
    const legacyReview=!snapshot.resume&&last?.role==='assistant'&&!last.questions?.length&&!/saved as revision/i.test(last.text)&&snapshot.currentDraft&&snapshot.task
      ? {text:last.text,task:snapshot.task,questions:[],assumptions:[],blockers:[],proposal:snapshot.currentDraft,baseline:null,review:null,destination:null}:undefined;
    const restored=(snapshot.resume?.reply??legacyReview) as unknown as Reply|undefined;
    setDraftNeedsRefresh(true);
    if(restored&&typeof restored.text==='string'){
      const questions=aiQuestionsSchema.parse(restored.questions??[]);
      let proposal:Draft|null=null;
      if(restored.proposal&&snapshot.task){
        if(snapshot.task.scope==='strategy')proposal=tradingPlanSchema.parse(restored.proposal);
        else {const {data}=await apiClient.get<RuleCapabilities>('/market-data/capabilities');proposal=createMonthlyRuleSchema(data.choices).parse(restored.proposal);}
      }
      setReply({...restored,task:snapshot.task??null,questions,proposal,review:null});
      if(proposal&&snapshot.task){
        if(snapshot.task.scope==='strategy'){
          const {data:current}=await apiClient.get<{_id:string;revision:number}[]>('/strategies');
          const saved=current.find(item=>item._id===snapshot.task!.id);
          if((saved?.revision??0)!==snapshot.task.revision)throw new Error('This strategy changed since this review. Ask the assistant to update the draft using the latest saved rules.');
          const {data:review}=await apiClient.post<Review>('/strategies/review',proposal);
          if(typeof review.blocked!=='boolean'||!Array.isArray(review.issues))throw new Error('Could not recheck the restored draft. Ask the assistant to review it again.');
          setReply({...restored,task:snapshot.task,questions,proposal,review});setDraftNeedsRefresh(false);setReviewOpen(!!snapshot.resume?.reviewOpen);
        } else {
          const {data:current}=await apiClient.get<{rule:{revision:number}|null}>('/qualification');
          if((current.rule?.revision??0)!==snapshot.task.revision)throw new Error('Qualification rules changed since this review. Ask the assistant to update the draft.');
          const {data:review}=await apiClient.post<Review>('/qualification/rule/review',proposal);
          if(typeof review.blocked!=='boolean'||!Array.isArray(review.issues))throw new Error('Could not recheck the restored qualification draft.');
          setReply({...restored,task:snapshot.task,questions,proposal,review});setDraftNeedsRefresh(false);setReviewOpen(!!snapshot.resume?.reviewOpen);
        }
      }
    } else if(last?.role==='assistant'&&last.questions?.length)setReply({text:last.text,task:snapshot.task??null,questions:aiQuestionsSchema.parse(last.questions),assumptions:[],blockers:[],proposal:null,baseline:null,review:null,destination:null});
    setHistoryOpen(false);
  }catch(e){setHistoryOpen(false);setError(e instanceof Error?e.message:'Could not open this chat');}};
  const renameChat=(id:string,title:string)=>{let name=title;Modal.confirm({title:'Rename conversation',content:<Input aria-label="Conversation name" defaultValue={title} maxLength={80} onChange={e=>{name=e.target.value;}}/>,onOk:async()=>{try{await history.rename(id,name);}catch(e){setError(e instanceof Error?e.message:'Rename failed');throw e;}}});};
  const deleteChat=(id:string)=>{Modal.confirm({title:'Delete this conversation?',content:'This deletes the saved chat only. Strategies, backtests and paper sessions remain unchanged.',okText:'Delete chat',okButtonProps:{danger:true},onOk:async()=>{try{await history.remove(id);if(id===history.id)clearChat();}catch(e){setError(e instanceof Error?e.message:'Delete failed');throw e;}}});};
  const changes = reply?.baseline && reply.proposal && isStrategy(reply.baseline) && isStrategy(reply.proposal) ? strategyChanges(reply.baseline, reply.proposal) : [];
  const initialOpen=useRef(openChat),restoring=useRef(false);
  useEffect(()=>{if(restoring.current)return;restoring.current=true;try{const id=sessionStorage.getItem('quantforge-active-chat');if(id)void initialOpen.current(id);}catch{/* Browser storage is optional. */}},[]);
  return <section className={`assistant-page ${messages.length ? 'has-conversation' : 'is-welcome'}`} aria-label="QuantForge assistant" hidden={!active}>
    <header className="assistant-page-header"><div><h1>AI assistant</h1><span>One place to build your trading plan</span></div><Space><Button aria-label="Chat history" icon={<HistoryOutlined aria-hidden />} onClick={()=>setHistoryOpen(true)}>Chat history</Button><Button aria-label="New conversation" icon={<PlusOutlined aria-hidden />} disabled={busy || saving || readingFile || history.loading} onClick={()=>void reset()}>New conversation</Button></Space></header>
    <Drawer title="Chat history" placement="right" open={historyOpen&&active} onClose={()=>setHistoryOpen(false)} size={380} styles={{wrapper:{maxWidth:"100vw"},body:{padding:0}}}><aside className="assistant-history" aria-label="Saved conversations"><Input.Search aria-label="Search conversations" placeholder="Search loaded chats" value={historySearch} onChange={e=>setHistorySearch(e.target.value)}/><div className="assistant-history-list">{history.items.filter(item=>item.title.toLowerCase().includes(historySearch.toLowerCase())).map(item=><div className={item._id===history.id?'selected':''} key={item._id}><button className="assistant-chat-link" disabled={busy||saving||readingFile||history.loading} onClick={()=>void openChat(item._id)} title={item.title}><span>{item.title}</span><small>{new Date(item.updatedAt).toLocaleDateString()}</small></button><Dropdown trigger={['click']} menu={{items:[{key:'rename',label:'Rename'},{key:'delete',label:'Delete',danger:true}],onClick:({key})=>key==='rename'?renameChat(item._id,item.title):deleteChat(item._id)}}><Button type="text" aria-label={`Options for ${item.title}`} disabled={busy||saving||history.loading}>...</Button></Dropdown></div>)}</div>{!history.items.length&&<p>Your conversations will appear here.</p>}{history.hasMore&&<Button onClick={()=>void history.refresh(history.items.at(-1)?.updatedAt)}>Load older chats</Button>}{history.storage&&<div className="assistant-storage" aria-label="Chat storage"><strong>Chat storage</strong><Progress percent={Math.round(history.storage.percent)} size="small" status={history.storage.percent>=90?'exception':'normal'}/><small>{(history.storage.usedBytes/1048576).toFixed(1)} / {history.storage.maxBytes/1048576} MB of chat data<br/>{history.storage.count} / {history.storage.maxCount} conversations</small>{history.storage.percent>=90&&<Alert type="warning" title="Chat storage is nearly full"/>}<p>At either limit, the oldest chats are automatically removed until usage is at most 85%. The chat being saved is protected. Strategies and trading records are kept.</p>{history.storage.lastCleanupAt&&<small>Last cleanup: {history.storage.lastRemovedCount} older chats removed on {new Date(history.storage.lastCleanupAt).toLocaleString()}.</small>}</div>}<small>Saved in this workspace. Attachments in new messages are retained with this chat.</small></aside></Drawer>
    <div className="assistant-workspace">
      {task && <div className="assistant-task"><Tag>{task.scope === 'monthly' ? 'Monthly qualification' : 'Strategy'}</Tag><span>{task.revision ? `Editing saved revision ${task.revision}` : 'New draft'}</span></div>}
      <div ref={log} role="log" aria-live="polite" aria-label="Workspace assistant conversation" className="assistant-log">
        {!messages.length && <div className="assistant-welcome"><div className="assistant-emblem" aria-hidden="true"><RobotOutlined /></div><h2>What would you like to build?</h2><p>Turn your trading ideas into clear rules.<br />I will help with the details, ask what is missing, and prepare a draft for you to review.</p></div>}
        {messages.map((item, index) => <article key={index} className={`assistant-message ${item.role}`}><strong>{item.role === 'user' ? 'You' : 'QuantForge'}</strong>{item.role === 'assistant' ? <AssistantAnswer text={item.text} activity={item.activity} /> : <AssistantMarkdown text={item.text}/>}{!!item.activity?.length&&<Collapse size="small" style={{marginTop:12}} items={[{key:'checks',label:`App records checked (${item.activity.length})`,children:item.activity.map((check,i)=><div key={i} style={{marginBottom:12}}><Tag color={check.status==='completed'?'green':'orange'}>{check.status==='completed'?'Checked':'Unavailable'}</Tag><strong>{check.tool}</strong><p>{check.summary}</p><small>{new Date(check.checkedAt).toLocaleString()} - snapshot at time of reply</small><br/><Button type="link" size="small" onClick={()=>navigate(({backtests:'/strategies?tab=backtests',paper:'/paper-trading',qualification:'/qualification',connections:'/data-sources'})[check.tool])}>Open source screen</Button></div>)}]}/>}{index<messages.length-1&&<ArchivedReply item={item}/>} {!!item.attachments?.length&&<details><summary>Attachments ({item.attachments.length})</summary>{item.attachments.map((file,i)=><div key={i}><strong>{file.name}</strong>{file.kind==='text'?<pre style={{maxHeight:240,overflow:'auto'}}>{file.text}</pre>:<img style={{maxWidth:'100%',maxHeight:240}} src={`data:${file.mimeType};base64,${file.data}`} alt={file.name}/>}</div>)}</details>}</article>)}
        {reply?.memory&&<Collapse size="small" items={[{key:"memory",label:"Earlier context - automatically compacted",children:<p style={{whiteSpace:"pre-wrap"}}>{reply.memory}</p>}]}/>}
        {busy && <AssistantLoading timed />}
        {reply?.questions?.length ? <AssistantQuestions key={history.id+JSON.stringify(reply.questions)} initialState={questionState} onStateChange={setQuestionState} questions={reply.questions} busy={busy||saving||voice.listening} onAnswer={text=>void send(text)} />:null}
        {reply?.assumptions?.length ? <Alert type="info" title="Assumptions to review" description={reply.assumptions.join(' ')} /> : null}
        {reply?.blockers?.length ? <Alert type="warning" title="More information needed" description={reply.blockers.join(' ')} /> : null}
        {reply?.proposal && <Collapse defaultActiveKey={['draft']} items={[{ key: 'draft', label: reply.task?.scope === 'monthly' ? 'Proposed qualification rules' : 'Proposed strategy', children: <DraftSummary draft={reply.proposal} /> }]} />}
        {!!reply?.review?.issues.length && <Collapse items={[{ key: 'review', label: `${reply.review.issues.length} checks to review`, children: reply.review.issues.map((issue, i) => <Alert key={i} style={{ marginBottom: 8 }} type={issue.severity === 'error' ? 'error' : 'warning'} title={issue.title} description={`${issue.explanation} ${issue.recommendation}`} />) }]} />}
        {reply?.review?.blocked && <Alert type="error" title="Resolve the conflicting rules before saving" description="Tell the assistant what you want to change; it will check the next draft again." />}
        {workflow&&workflow.kind!=='qualification'&&<Suspense fallback={<AssistantLoading label="Loading backtest controls" />}><AssistantBacktestRun onEvent={text=>setMessages(previous=>[...previous,{role:'assistant',text}])} initialState={backtestState} onStateChange={setBacktestState} key={`${history.id}:${workflow.strategyId}:${workflow.revision}:${workflow.sourceReportId??''}`} workflow={workflow} visible={active} onExplain={id=>void send(`Inspect backtest report ${id}. Explain performance, data gaps and next steps.`)}/></Suspense>}
        {workflow?.kind==='qualification'&&<Suspense fallback={<AssistantLoading label="Loading scan controls" />}><AssistantQualificationRun key={`${history.id}:${workflow?.revision??task?.revision}`} initialState={qualificationState} onStateChange={setQualificationState} revision={workflow.revision} visible={active}/></Suspense>}
        {workflow?.kind!=='qualification' && savedMessage && task?.scope === 'monthly' && <Suspense fallback={<AssistantLoading label="Loading scan controls" />}><AssistantQualificationRun key={`${history.id}:${workflow?.revision??task?.revision}`} initialState={qualificationState} onStateChange={setQualificationState} revision={task.revision} visible={active} /></Suspense>}
      </div>
      <div className="assistant-compose-area">{readingFile && <AssistantLoading label="Reading attachment" />}{saving && <AssistantLoading label="Saving your reviewed changes" />}
      {history.error&&<Alert type="warning" title="Chat history not saved or loaded" description={history.error} action={<Button onClick={()=>void history.flush().catch(()=>{})}>Retry save</Button>}/>}
      {error && <Alert type="error" title="Could not complete the request" description={error} />}
      <Space wrap>{ready && <Button type="primary" disabled={busy || saving} onClick={() => setReviewOpen(true)}>Review and save</Button>}{reply?.destination && allowedDestinations.has(reply.destination) && <Button onClick={() => navigate(reply.destination!)}>Open relevant screen</Button>}</Space>
      <div className={`assistant-composer${voice.listening ? " is-listening" : ""}`}>
      {!!attachments.length&&<div className="assistant-attachments">{attachments.map((file,i)=><div key={i}>{file.kind==='image'&&<img src={`data:${file.mimeType};base64,${file.data}`} alt={`Attached ${file.name}`}/>}<span>{file.name}{file.kind==='text'&&` (${file.text.length.toLocaleString()} characters)`}</span>{file.kind==='text'&&<Button type="text" size="small" aria-label={`Preview ${file.name}`} onClick={()=>setPreviewText(file)}>View</Button>}<Button type="text" size="small" aria-label={`Remove ${file.name}`} icon={<CloseOutlined/>} disabled={busy||saving} onClick={()=>setAttachments(previous=>previous.filter((_,n)=>n!==i))}/></div>)}</div>}
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,.txt,.md,.csv" hidden aria-label="Attach strategy file" onChange={e=>{const file=e.target.files?.[0];if(file)void addFile(file);}}/>
      {voice.listening && <VoiceWaveform />}
      <AssistantComposerInput key={history.id} input={input} value={prompt} onChange={setPrompt} disabled={busy||saving||voice.listening||history.loading} onSend={()=>void send()} onFile={file=>{void addFile(file);}} onLargePaste={text=>{void addFile(new File([text],'pasted-text.txt',{type:'text/plain'})).then(ok=>{if(!ok){setPastedNote(text);setPasteOpen(true);}});}}/>
      <div className="assistant-compose-footer"><div className="assistant-input-tools"><Dropdown trigger={['click']} menu={{items:[{key:'chart',label:'Attach chart screenshot'},{key:'note',label:'Attach strategy note / CSV'},{type:'divider'},{key:'paste',label:'Paste trading idea or code'}],onClick:({key})=>{if(key==='paste')setPasteOpen(true);else chooseFile(key==='chart'?'image/png,image/jpeg,image/webp':'.txt,.md,.csv');}}}><Button aria-label="Add context" title="Add a chart, note or trading idea" icon={<PaperClipOutlined/>} disabled={busy||saving||readingFile||attachments.length>=2} loading={readingFile}/></Dropdown><Tooltip title={voice.supported?'Dictate using your browser speech service; review before sending.':'Voice needs a supported browser such as Chrome or Edge.'}><Button aria-label={voice.listening?'Stop dictation':'Start dictation'} danger={voice.listening} icon={voice.listening?<StopOutlined/>:<AudioOutlined/>} disabled={busy||saving||!voice.supported} onClick={()=>voice.listening?voice.stop():voice.start(prompt)}>{voice.listening ? "Stop" : null}</Button></Tooltip></div>{busy ? <Button onClick={cancel}>Stop</Button> : <Button type="primary" aria-label="Send" shape="circle" icon={<ArrowUpOutlined />} disabled={saving || readingFile || voice.listening || (prompt.trim().length < 3&&!attachments.length)} onClick={() => void send()} />}</div>
      </div>
      {voice.listening&&<p role="status" className="assistant-voice-status">Stop dictation when finished, review your words, then send.</p>}
      {voice.error&&<div role="alert" className="assistant-voice-notice"><span>{voice.error}</span><Button type="text" size="small" aria-label="Dismiss voice message" icon={<CloseOutlined />} onClick={voice.dismissError}/></div>}
      <div className="assistant-input-hint">Enter sends; in lists it continues the list. Ctrl + Enter sends; Shift + Enter adds a line. Voice uses your browser's speech service.</div>
      {!!attachments.length&&<div className="assistant-input-hint">Files are sent to your configured AI with each message until removed. They are not imported as market data.</div>}
      {!messages.length && <div className="assistant-starters">{[
        { title: 'Qualify stocks', detail: 'Choose the companies that fit your criteria', prompt: 'Help me set my monthly qualification rules.', icon: <SafetyCertificateOutlined /> },
        { title: 'I am new to trading', detail: 'Help me choose a simple paper-trading plan', prompt: 'I am new to trading. Help me build a simple paper-trading plan. Ask the important questions with recommended starting options, then suggest the technical settings.', icon: <ThunderboltOutlined /> },
        { title: 'Improve saved rules', detail: 'Review and refine an existing trading plan', prompt: 'Help me improve one of my saved strategies.', icon: <RobotOutlined /> },
        { title: 'Check my workspace', detail: 'Inspect paper trading, feeds and data gaps', prompt: 'Check my paper trading, feed connection and latest qualification data. Explain any observed blockers and what to do next.', icon: <BulbOutlined /> },
      ].map(item => <button className="assistant-starter" key={item.title} onClick={() => { setPrompt(item.prompt); input.current?.focus(); }}>{item.icon}<strong>{item.title}</strong><span>{item.detail}</span></button>)}</div>}
      </div>
      </div>
      <Modal title={previewText?.name} open={!!previewText&&active} footer={null} onCancel={()=>setPreviewText(undefined)}><Input.TextArea aria-label="Attached text preview" readOnly value={previewText?.text} autoSize={{minRows:6,maxRows:18}}/></Modal>
      <Modal title="Paste trading idea or code" open={pasteOpen&&active} okText="Attach to message" okButtonProps={{disabled:!pastedNote.trim()||pastedNote.length>20000||readingFile||attachments.length>=2}} onCancel={()=>setPasteOpen(false)} onOk={()=>{void addFile(new File([pastedNote],'strategy-note.txt',{type:'text/plain'})).then(ok=>{if(ok){setPasteOpen(false);setPastedNote('');}});}}>
        <p>Paste your rules, a strategy explanation, or source code you can access. The assistant can explain it and discuss which rules QuantForge supports. Code is read as text and is not executed.</p>
        {pastedNote.length>20000&&<Alert type="warning" title="This paste exceeds 20,000 characters. Your text is preserved here; shorten it before attaching."/>}{attachments.length>=2&&<Alert type="info" title="Two files are already attached. Close this window and remove one, then reopen Paste trading idea or code. Your paste will remain here."/>}
        <Input.TextArea aria-label="Trading idea or code" value={pastedNote} onChange={e=>setPastedNote(e.target.value)} maxLength={20000} showCount autoSize={{minRows:7,maxRows:14}} placeholder="Paste here..."/>
      </Modal>
      <Modal title={reply?.task?.scope === 'monthly' ? 'Review qualification rules' : 'Review strategy changes'} open={reviewOpen && active} width={900} styles={{ body: { maxHeight: '65vh', overflowY: 'auto' } }} okText="Save these rules" confirmLoading={saving} okButtonProps={{ disabled: !ready, 'aria-label': 'Save these rules' }} cancelButtonProps={{ disabled: saving }} closable={!saving} mask={{ closable: !saving }} keyboard={!saving} onCancel={() => setReviewOpen(false)} onOk={() => void save()}>
        <p>{reply?.task?.revision ? `Updating saved revision ${reply.task.revision}.` : 'Creating a new strategy.'} Saving does not start a scan or trading.</p>
        {error && <Alert type="error" title="Save not confirmed" description={error} />}
        {reply?.assumptions?.length ? <Alert type="info" title="Assumptions" description={reply.assumptions.join(' ')} /> : null}
        {!!reply?.review?.issues.length && <Alert type="warning" title="Review these points before saving" description={reply.review.issues.map(issue => `${issue.title}: ${issue.recommendation}`).join(' ')} />}
        {reply?.proposal && <Tabs items={[{ key: 'proposed', label: 'Proposed rules', children: <DraftSummary draft={reply.proposal} /> }, ...(reply.baseline ? [{ key: 'saved', label: `Currently saved (revision ${reply.task?.revision})`, children: <DraftSummary draft={reply.baseline} saved /> }] : []), ...(changes.length ? [{ key: 'changes', label: `Changes (${changes.length})`, children: <ul>{changes.map((change, i) => <li key={i}><strong>{change.section} / {change.label}</strong><p>From: {change.before}<br />To: {change.after}</p></li>)}</ul> }] : [])]} />}
      </Modal>
    </section>;
}
