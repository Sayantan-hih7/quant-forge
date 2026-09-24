import { Radio } from 'antd';
import { UserOutlined, ApartmentOutlined } from '@ant-design/icons';
import type { UserRole } from '../types';

export function RoleSelector({ value, onChange }: { value: UserRole; onChange: (role: UserRole) => void }) {
  return <Radio.Group className="role-selector" value={value} onChange={(event) => onChange(event.target.value)} aria-label="Account role">
    <Radio.Button value="client"><UserOutlined /><span><strong>Retail client</strong><small>Invest with strategies</small></span></Radio.Button>
    <Radio.Button value="admin"><ApartmentOutlined /><span><strong>Expert / Admin</strong><small>Build and manage</small></span></Radio.Button>
  </Radio.Group>;
}
