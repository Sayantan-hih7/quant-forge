import { Modal, Alert, Avatar, Button } from 'antd';
import { GoogleOutlined, AppleOutlined, UserOutlined } from '@ant-design/icons';
export function SocialAuthModal({ provider, onClose, onContinue }: {
  provider: 'Google' | 'Apple' | null; onClose: () => void; onContinue: () => void;
}) {
  return <Modal open={!!provider} onCancel={onClose} title={<>{provider === 'Google' ? <GoogleOutlined /> : <AppleOutlined />} Continue with {provider}</>} footer={null}>
    <Alert type="info" showIcon title="Simulated social sign-in" description="This preview does not contact Google or Apple. Choose the sample account to explore the client flow." />
    <div className="social-account"><Avatar icon={<UserOutlined />} /><div><strong>Demo retail client</strong><p>client@example.com</p></div></div>
    <Button block type="primary" onClick={onContinue}>Continue with demo account</Button>
  </Modal>;
}
