import { Tag, Tooltip } from 'antd';
import { ExportOutlined, FileTextOutlined, RobotOutlined } from '@ant-design/icons';
import { eventLabels, type NewsCompany, type NewsStory } from '../types';
import { relativeTime, sentimentText, tone } from '../format';

function safeUrl(value: string) { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : undefined; } catch { return undefined; } }

export function SentimentBadge({ story }: { story: NewsStory }) {
  const { score, label, method, reason, confidence } = story.sentiment;
  return <Tooltip title={<>{reason}<br/>{method === 'ai' ? 'Scored by AI' : 'Keyword estimate (AI score pending or unavailable)'} · confidence {Math.round(confidence * 100)}%</>}>
    <span className={`news-sentiment news-sentiment-${label}`}>{method === 'ai' && <RobotOutlined />}{sentimentText[label]}{label !== 'neutral' && ` ${score > 0 ? '+' : '−'}${Math.abs(score).toFixed(1)}`}</span>
  </Tooltip>;
}
function CompanyChip({ company, onOpen }: { company: NewsCompany; onOpen?: (company: NewsCompany) => void }) {
  const label = company.sentiment === undefined ? undefined : tone(company.sentiment);
  return <Tooltip title={`${company.name}${company.sentiment !== undefined ? ` · impact ${company.sentiment > 0 ? '+' : ''}${company.sentiment.toFixed(1)}` : ''} · ${company.method === 'filing' ? 'exchange filing' : company.method === 'ai' ? 'identified by AI' : 'matched by name'}`}>
    <button type="button" className={`news-company ${label ? `news-company-${label}` : ''}`} onClick={() => onOpen?.(company)} disabled={!onOpen} aria-label={`Open ${company.symbol}`}>{company.symbol}</button>
  </Tooltip>;
}
export function NewsStoryCard({ story, onOpen, hideCompanies, now }: { story: NewsStory; onOpen?: (company: NewsCompany) => void; hideCompanies?: boolean; now: number }) {
  const href = safeUrl(story.url);
  // Live blogs and roundups name many companies in passing; show the most confident few.
  const companies = [...story.companies].sort((a, b) => b.confidence - a.confidence).slice(0, 6);
  return <article className={`news-story news-story-${story.sentiment.label}`}>
    <div className="news-story-meta">
      <SentimentBadge story={story} />
      <span className="news-publisher">{story.kind === 'filing' ? <><FileTextOutlined /> NSE filing</> : story.publisher}</span>
      <span title={new Date(story.publishedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}>{relativeTime(story.publishedAt, now)}</span>
      {story.sentiment.eventType !== 'other' && <Tag bordered={false}>{eventLabels[story.sentiment.eventType]}</Tag>}
    </div>
    <h4>{href ? <a href={href} target="_blank" rel="noreferrer noopener">{story.title} <ExportOutlined /></a> : story.title}</h4>
    {story.summary && story.summary !== story.title && <p className="news-summary">{story.summary}</p>}
    {!hideCompanies && companies.length > 0 && <div className="news-companies">{companies.map(c => <CompanyChip key={c.isin} company={c} onOpen={onOpen} />)}{story.companies.length > companies.length && <span className="muted">+{story.companies.length - companies.length}</span>}</div>}
  </article>;
}
