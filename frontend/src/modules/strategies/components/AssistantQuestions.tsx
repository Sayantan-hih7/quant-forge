import {useEffect,useState} from 'react';
import {Button, Input, Radio, Tabs, Tag} from 'antd';
import {CheckOutlined,LeftOutlined,RightOutlined} from '@ant-design/icons';
import type {AiQuestion} from '../../../services/aiAssistant';
import '../../../styles/assistant-questions.css';

export interface QuestionProgress {active:string;answers:Record<string,string>;custom:Record<string,boolean>}
export function AssistantQuestions({questions,busy,onAnswer,initialState,onStateChange}:{questions:AiQuestion[];busy:boolean;onAnswer:(text:string)=>void;initialState?:QuestionProgress;onStateChange?:(state:QuestionProgress)=>void}){
 const [active,setActive]=useState(initialState?.active??'0'),[answers,setAnswers]=useState<Record<string,string>>(initialState?.answers??{}),[custom,setCustom]=useState<Record<string,boolean>>(initialState?.custom??{}),[error,setError]=useState('');
 useEffect(()=>{onStateChange?.({active,answers,custom});},[active,answers,custom,onStateChange]);
 const resolved=(q:AiQuestion)=>answers[q.id]?.trim();
 const answered=questions.filter(q=>resolved(q)).length;
 const defaults=questions.filter(q=>!resolved(q)&&q.allowRecommendedDefault&&q.recommendedOption);
 const submit=(useDefaults:boolean)=>{
  if(busy)return;
  const missing=questions.findIndex(q=>!resolved(q)&&!(useDefaults&&q.allowRecommendedDefault&&q.recommendedOption));
  if(missing>=0){setActive(String(missing));setError('This detail needs your answer. Choose an option or write your own.');return;}
  setError('');
  onAnswer('My answers to your latest questions:\n'+questions.map((q,i)=>`${i+1}. [${q.id}] ${resolved(q)||q.recommendedOption}${!resolved(q)?' (use this recommended draft default)':''}`).join('\n'));
 };
 return <section className="assistant-questions" aria-label="Questions to complete your plan">
  <header><div><h3>A few details for your plan</h3><p>Choose an option or answer in your own words.</p></div><span>{answered} / {questions.length} answered</span></header>
  <Tabs activeKey={active} onChange={key=>{setActive(key);setError('');}} items={questions.map((q,i)=>({key:String(i),label:<span>{resolved(q)&&<CheckOutlined aria-hidden />} Question {i+1}</span>,children:<div className="assistant-question-card">
   <h4>{q.question}</h4><p className="muted">{q.reason}</p>
   <Radio.Group aria-label={q.question} value={custom[q.id]?'custom':answers[q.id]} disabled={busy} onChange={e=>{const value=String(e.target.value);setError('');setCustom(prev=>({...prev,[q.id]:value==='custom'}));setAnswers(prev=>({...prev,[q.id]:value==='custom'?'':value}));}}>
    {q.options.map(option=><Radio key={option} value={option}><span>{option}</span>{q.recommendedOption===option&&<Tag color="blue">Recommended</Tag>}</Radio>)}
    <Radio value="custom">Write my own answer</Radio>
   </Radio.Group>
   {(custom[q.id]||!q.options.length)&&<Input.TextArea aria-label={`Your answer to question ${i+1}`} value={answers[q.id]??''} onChange={e=>{setAnswers(prev=>({...prev,[q.id]:e.target.value}));setError('');}} maxLength={250} showCount autoSize={{minRows:2,maxRows:4}} disabled={busy} placeholder="Tell me what works for you..."/>}
   {q.recommendedOption&&q.recommendationReason&&<p className="assistant-recommendation"><strong>Why this option:</strong> {q.recommendationReason}</p>}
   {!q.allowRecommendedDefault&&<p className="muted">Your answer is needed; this question will not be skipped.</p>}
  </div>}))}/>
  {error&&<p role="alert" className="assistant-question-error">{error}</p>}
  <footer><div><Button aria-label="Previous question" disabled={busy||active==='0'} icon={<LeftOutlined />} onClick={()=>setActive(String(Number(active)-1))}/><Button aria-label="Next question" disabled={busy||Number(active)===questions.length-1} icon={<RightOutlined />} onClick={()=>setActive(String(Number(active)+1))}/></div>
   <div>{defaults.length>0&&<Button disabled={busy} onClick={()=>submit(true)}>Use recommended defaults</Button>}<Button type="primary" loading={busy} onClick={()=>submit(false)}>Proceed</Button></div></footer>
  {defaults.length>0&&<small>Recommended defaults fill only unanswered, skippable questions. Your answers stay unchanged.</small>}
 </section>;
}
