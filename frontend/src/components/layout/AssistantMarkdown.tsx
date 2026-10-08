import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
export default function AssistantMarkdown({text}:{text:string}) { return (<div className="assistant-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
      img: ({ alt }) => <span>{alt ? `[Image: ${alt}]` : ''}</span>,
      a: ({ href, children }) => href && /^(https?:|mailto:)/i.test(href) ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
      table: ({ children }) => <div className="assistant-table-scroll"><table>{children}</table></div>,
    }}>{text}</ReactMarkdown></div>); }
