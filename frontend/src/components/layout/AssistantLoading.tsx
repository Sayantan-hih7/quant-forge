import { useEffect, useState } from 'react';
import { RobotOutlined } from '@ant-design/icons';

export function AssistantLoading({ label = 'Preparing your response', timed = false }: { label?: string; timed?: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!timed) return;
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [timed]);
  return <div className="assistant-loading" role="status" aria-label={label}>
    <span className="assistant-loading-icon" aria-hidden="true"><RobotOutlined /></span>
    <div className="assistant-loading-content"><div className="assistant-loading-title">{label}<span className="assistant-loading-dots" aria-hidden="true"><i /><i /><i /></span></div>
      {timed && <small>{seconds >= 15 ? 'Still waiting for the response. You can stop this request below.' : 'You can stop this request at any time.'}</small>}
    </div>{timed && <span className="assistant-loading-time" aria-hidden="true">{seconds}s</span>}
  </div>;
}
