import { useEffect, useId, useRef } from 'react';
import { App, type AlertProps } from 'antd';

/** Transient request failures are out of flow; polling must not re-open the same toast. */
export function RequestFeedback({ title, description, action, type = 'error' }: AlertProps) {
  const { notification } = App.useApp();
  const key = useId();
  const content = useRef({ title, description, action });
  useEffect(() => { content.current = { title, description, action }; });
  const identity = [typeof title === 'string' ? title : '', typeof description === 'string' ? description : ''].join('|');
  useEffect(() => {
    notification.open({ key, type, title: content.current.title, description: content.current.description,
      actions: content.current.action, duration: 8, role: 'status', placement: 'topRight' });
    return () => notification.destroy(key);
  }, [identity, key, notification, type]);
  return null;
}
