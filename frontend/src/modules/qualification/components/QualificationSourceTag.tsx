import { Tag, Tooltip } from 'antd';
import { UserAddOutlined } from '@ant-design/icons';
import type { CandidateStock } from '../types';

export function QualificationSourceTag({ stock }: { stock: CandidateStock }) {
  return stock.qualificationSource === 'manual' ? <Tooltip title="Included by your judgment. Custom criteria are not evaluated by the monthly scan."><Tag className="q-manual-tag" color="gold" icon={<UserAddOutlined aria-hidden />}>Manually added</Tag></Tooltip> : null;
}
