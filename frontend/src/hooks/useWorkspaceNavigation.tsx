import { AppstoreOutlined, ApartmentOutlined, BellOutlined, SettingOutlined } from '@ant-design/icons';
import { navigation } from '../config/navigation';
import {useLocation} from 'react-router-dom';

const adminNavigation = navigation.map((group) => ({
  ...group,
  items: group.items.map((item) => item.path === '/' ? { ...item, path: '/admin/dashboard' } : item),
}));
const clientNavigation: typeof navigation = [
  { title: '', items: [{ path: '/client/dashboard', label: 'My dashboard', icon: <AppstoreOutlined /> }] },
  { title: 'My workspace', items: [
    { path: '/client/strategies', label: 'My subscriptions', icon: <ApartmentOutlined /> },
    { path: '/client/notifications', label: 'Notifications', icon: <BellOutlined /> },
  ] },
  { title: 'Account', items: [{ path: '/client/settings', label: 'Account settings', icon: <SettingOutlined /> }] },
];
export function useWorkspaceNavigation() {
  const {pathname}=useLocation();
  return pathname.startsWith('/client/') ? clientNavigation : adminNavigation;
}
