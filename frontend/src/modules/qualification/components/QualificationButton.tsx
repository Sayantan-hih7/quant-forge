import { useState } from 'react';
import { Button, Tooltip } from 'antd';
import { CheckOutlined, PlusOutlined } from '@ant-design/icons';
import { qualifiedMember, useStockActions, type ActionStock } from '../../watchlists/hooks/useStockActions';
import { ManualQualificationModal } from './ManualQualificationModal';

export function QualificationButton({ stock, onAdded }: { stock: ActionStock; onAdded?: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const membership = useStockActions(state => state.membership);
  const member = qualifiedMember(stock, membership);
  const reason = member ? `${member.source === 'manual' ? 'Manually added; monthly rules not verified' : 'Qualified by the published scan'}. NSE/BSE listings of this company share one qualification.`
    : !membership ? 'Loading qualification status. Retry if unavailable.' : !membership.published ? 'Publish your monthly qualified list in Qualification first.' : stock.active === false ? 'This listing is inactive.' : 'Add using your own research; monthly rules are not marked as passed.';
  return <><Tooltip title={reason}><span><Button size="small" icon={member ? <CheckOutlined /> : <PlusOutlined />} disabled={!!member || !membership?.published || stock.active === false}
    aria-label={member ? `${stock.symbol} already qualified` : `Add ${stock.symbol} to qualification`} onClick={() => setOpen(true)}>{member ? 'Already qualified' : 'Add to qualification'}</Button></span></Tooltip>
    {open && <ManualQualificationModal stock={stock} onClose={() => setOpen(false)} onAdded={onAdded} />}</>;
}
