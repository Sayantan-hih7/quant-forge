import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Alert, App, Button, Divider, Form } from 'antd';
import { ArrowLeftOutlined, SafetyCertificateOutlined, KeyOutlined } from '@ant-design/icons';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RhfInput } from '../../../components/forms';
import { AuthLayout } from '../components/AuthLayout';
import { verificationSchema, type VerificationValues } from '../schemas/authSchema';
import { useAuthStore } from '../../../store/authStore';
import { homeFor } from '../utils/routes';

export default function VerifyPage() {
  const auth = useAuthStore();
  const navigate = useNavigate();
  const { modal, message } = App.useApp();
  const [resent, setResent] = useState(false);
  const { control, handleSubmit, setError, reset } = useForm<VerificationValues>({ resolver: zodResolver(verificationSchema), defaultValues: { code: '' } });
  if (!auth.pending) return <Navigate to={homeFor(auth.session)} replace />;
  const mobile = auth.pending.step === 'mobile';
  const verify = ({ code }: VerificationValues) => {
    const success = mobile ? auth.verifyMobile(code) : auth.completeMfa(code);
    if (!success) setError('code', { message: 'That code did not match. Try the demo code below.' });
    else reset();
  };
  const passkey = () => modal.confirm({
    title: 'Simulate passkey verification',
    content: 'This UI preview does not create or use a real passkey. Approve to preview successful admin verification.',
    okText: 'Approve demo passkey', cancelText: 'Cancel',
    onOk: () => auth.completeDemoPasskey(),
  });
  return <AuthLayout><Button type="text" icon={<ArrowLeftOutlined />} className="auth-back" onClick={() => { auth.cancelVerification(); navigate('/login'); }}>Back to sign in</Button>
    <div className="verification-icon"><SafetyCertificateOutlined /></div>
    <div className="auth-heading"><span className="auth-eyebrow">{mobile ? 'VERIFY YOUR MOBILE' : 'EXPERT ACCESS'}</span><h1>{mobile ? 'One more step' : 'Verify it’s you'}</h1><p>{mobile ? 'Enter the mobile verification code to continue.' : 'Enter the six-digit code from your authenticator app.'}</p><small>{auth.pending.email}</small></div>
    <Form layout="vertical" onFinish={handleSubmit(verify)} requiredMark={false}>
      <RhfInput name="code" control={control} label={mobile ? 'Mobile verification code' : 'Authenticator code'} placeholder="000000" maxLength={6} inputMode="numeric" autoComplete="one-time-code" className="verification-input" />
      <Button block type="primary" htmlType="submit">{mobile ? 'Verify mobile' : 'Verify and sign in'}</Button>
    </Form>
    {mobile ? <Button type="link" className="resend-code" disabled={resent} onClick={() => { setResent(true); message.info('Demo code reissued: 123456. No SMS was sent.'); }}>{resent ? 'Demo code reissued' : 'Resend demo code'}</Button> : <><Divider plain>or use another method</Divider><Button block icon={<KeyOutlined />} onClick={passkey}>Use a passkey</Button></>}
    <Alert className="auth-demo-note" type="info" showIcon title={`Demo code: ${mobile ? '123456' : '654321'}`} description="Verification is simulated for design review. No real SMS, authenticator, or passkey service is connected." />
  </AuthLayout>;
}
