import { Button, Empty, Skeleton } from 'antd';
/** Keep an in-place loading/failure state only when there is no usable content yet. */
export function ResourcePlaceholder({ loading, onRetry, label }: { loading: boolean; onRetry: () => void; label: string }) {
  return <section className="resource-placeholder" aria-busy={loading} aria-label={label}>
    {loading ? <Skeleton active paragraph={{ rows: 6 }} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`${label} could not be loaded.`}><Button onClick={onRetry}>Retry</Button></Empty>}
  </section>;
}
