import { Button, Popover, Tag } from 'antd';
export interface NewsQuickSummary {score:number|null;label:string;count:number;latestAt?:string;aiCount:number;stories:{id:string;title:string;url:string;publisher:string;publishedAt:string;score:number;reason:string;method:string}[]}
export function StockNewsSentiment({summary,loading,error,onRetry}:{summary?:NewsQuickSummary;loading:boolean;error?:string;onRetry:()=>void}){
 const color=summary?.score==null?'default':summary.score>=20?'green':summary.score<=-20?'red':'default';
 const stamp=(at:string)=>new Date(at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
 const content=<div style={{width:350,maxWidth:'calc(100vw - 70px)',maxHeight:430,overflowY:'auto'}}>
  <p>News sentiment over the last 7 days. Score ranges from -100 to +100, weighted by recency and classification confidence. It is not a price-change percentage or a buy/sell signal.</p>
  {error?<><p>News could not be updated. Any displayed score is from the last successful check.</p><Button size="small" onClick={onRetry}>Retry news</Button></>:loading?<p>Loading stored news coverage...</p>:!summary?<p>News coverage is unavailable for this listing.</p>:<>
   <p><strong>{summary.count} distinct {summary.count===1?'story':'stories'}</strong> ? {summary.aiCount} AI classified, {summary.count-summary.aiCount} keyword scored.{summary.count===1&&' Limited coverage: one headline can dominate this score.'}</p>
   {summary.count===0&&<p>No linked media stories or directional filings were found in this window. This is not a neutral rating.</p>}
   {summary.stories.map(story=><div key={story.id} style={{borderTop:'1px solid var(--border-color, #e5e7eb)',padding:'10px 0'}}>
    <a href={/^https?:\/\//i.test(story.url)?story.url:undefined} target="_blank" rel="noopener noreferrer">{story.title}</a>
    <div className="muted">{story.publisher} ? {stamp(story.publishedAt)} IST</div>
    <div><strong>{story.score>0?'+':''}{story.score}</strong> ? {story.method==='ai'?'AI assessment':'Keyword assessment'}</div><div>{story.reason||'Headline classification; open the source for context.'}</div>
   </div>)}
   {!!summary.count&&<small>Positive at +20 or above; negative at -20 or below. Duplicate headlines and routine neutral filings are excluded. The latest three contributing stories are shown.</small>}
  </>}
 </div>;
 return <Popover title="Why this news sentiment?" content={content} trigger={['hover','click']}><button type="button" className="stock-symbol-button" style={{textAlign:'left',fontWeight:400}} aria-label="Explain news sentiment">
  <Tag color={color}>{error?'News unavailable':loading?'Loading news':!summary?'Unavailable':summary.score===null?'No recent news':`${summary.label} ${summary.score>0?'+':''}${summary.score}`}</Tag>
  {summary&&!error&&!loading&&summary.count>0&&<div className="muted">{summary.count} {summary.count===1?'story':'stories'} ? 7 days</div>}
 </button></Popover>;
}
