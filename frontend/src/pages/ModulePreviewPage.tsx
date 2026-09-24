import { Button, Empty, Tag } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { navItems } from '../config/navigation';
import { Panel } from '../components/ui/Panel';
export default function ModulePreviewPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const title = navItems.find(item => item.path === pathname)?.label ?? 'Page not found';
  return <div className="page-enter"><div className="page-heading"><div><h1>{title}</h1><p>Planned workspace · no service connected</p></div><Tag>Planned</Tag></div><Panel title={title}><div className="module-empty"><Empty description={<><strong>{title} is not available in this preview yet.</strong><p className="muted">Qualification, Algo Strategies, Signal Runner and Paper Trading are connected to the local paper-trading backend.</p></>} /><Button type="primary" onClick={() => navigate('/signal-runner')}>Open signal runner</Button><Button onClick={() => navigate('/paper-trading')}>Open paper trading</Button></div></Panel></div>;
}