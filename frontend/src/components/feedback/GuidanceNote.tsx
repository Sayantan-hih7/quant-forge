import { type AlertProps } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

/** Explanatory guidance is available on demand, without dominating the workspace. */
export function GuidanceNote({ title, description, className, style }: AlertProps) {
  return <details className={`guidance-note ${className ?? ''}`} style={style}>
    <summary><InfoCircleOutlined aria-hidden />{title}</summary>
    <div className="guidance-note-body">{description}</div>
  </details>;
}
