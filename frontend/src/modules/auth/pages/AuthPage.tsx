import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, Button, Divider, Form, Segmented } from 'antd';
import { AppleOutlined, GoogleOutlined, ArrowRightOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RhfInput } from '../../../components/forms';
import { RhfPassword } from '../../../components/forms/RhfPassword';
import { AuthLayout } from '../components/AuthLayout';
import { RoleSelector } from '../components/RoleSelector';
import { SocialAuthModal } from '../components/SocialAuthModal';
import { createAuthSchema, type AuthFormValues } from '../schemas/authSchema';
import { useAuthStore } from '../../../store/authStore';
import type { UserRole } from '../types';

export default function AuthPage({ signup = false }: { signup?: boolean }) {
  const [role, setRole] = useState<UserRole>('client');
  const [method, setMethod] = useState('password');
  const [provider, setProvider] = useState<'Google' | 'Apple' | null>(null);
  const { modal } = App.useApp();
  const begin = useAuthStore((s) => s.begin);
  const otp = method === 'otp' && role === 'client';
  const { control, handleSubmit, reset } = useForm<AuthFormValues>({
    resolver: zodResolver(createAuthSchema(signup, otp)), mode: 'onBlur',
    defaultValues: { name: '', email: '', password: '', mobile: '' },
  });
  const submit = (values: AuthFormValues) => {
    begin({ email: values.email, name: values.name || (role === 'admin' ? 'Manish K.' : 'Retail client'), role }, signup || otp);
    reset();
  };
  return <AuthLayout>
    <div className="auth-heading"><span className="auth-eyebrow">WELCOME TO QUANTFORGE</span><h1>{signup ? 'Create your account' : 'Welcome back'}</h1><p>{signup ? 'Start with your role. Make this workspace yours.' : 'Sign in to your trading workspace.'}</p></div>
    <RoleSelector value={role} onChange={(value) => { setRole(value); setMethod('password'); reset(); }} />
    {role === 'admin' && <div className="auth-security-note"><SafetyCertificateOutlined /> Expert access requires a second verification step.</div>}
    {!signup && role === 'client' && <Segmented className="auth-method" block value={method} onChange={(value) => { setMethod(value); reset(); }} options={[{ value: 'password', label: 'Email & password' }, { value: 'otp', label: 'Mobile OTP' }]} />}
    <Form layout="vertical" onFinish={handleSubmit(submit)} requiredMark={false} className="auth-form">
      {signup && <RhfInput name="name" control={control} label="Full name" placeholder="Your full name" autoComplete="name" required />}
      <RhfInput name="email" control={control} label="Email address" placeholder="you@example.com" autoComplete="email" required />
      {(!otp || signup) && <RhfPassword name="password" control={control} label="Password" placeholder={signup ? '8+ characters, uppercase letter and number' : 'Enter your password'} autoComplete={signup ? 'new-password' : 'current-password'} required />}
      {(otp || signup) && <RhfInput name="mobile" control={control} label="Mobile number" placeholder="9876543210" prefix="+91" inputMode="tel" autoComplete="tel-national" required />}
      {!signup && !otp && <Button type="link" className="forgot-password" onClick={() => modal.info({ title: 'Password recovery preview', content: 'Email delivery will be added with the backend. For this demo, sign in with any valid email and a sample password of at least 8 characters.', okText: 'Got it' })}>Forgot password?</Button>}
      <Button type="primary" block htmlType="submit" className="auth-submit">{signup ? 'Create account' : otp ? 'Send demo OTP' : 'Sign in'} <ArrowRightOutlined /></Button>
    </Form>
    {role === 'client' && <><Divider plain>or continue with</Divider><div className="social-buttons"><Button icon={<GoogleOutlined />} onClick={() => setProvider('Google')}>Google</Button><Button icon={<AppleOutlined />} onClick={() => setProvider('Apple')}>Apple</Button></div></>}
    <p className="auth-alternate">{signup ? 'Already have an account?' : 'New to QuantForge?'} <Link to={signup ? '/login' : '/signup'}>{signup ? 'Sign in' : 'Create an account'}</Link></p>
    <Alert className="auth-demo-note" type="info" title="Demo access" description={signup ? 'Use sample details. Mobile verification uses code 123456.' : role === 'admin' ? 'Any valid email + 8-character password. Admin verification code: 654321.' : 'Any valid email + 8-character password. Mobile OTP: 123456.'} />
    <SocialAuthModal provider={provider} onClose={() => setProvider(null)} onContinue={() => { setProvider(null); begin({ email: 'client@example.com', name: 'Demo client', role: 'client' }); }} />
  </AuthLayout>;
}
