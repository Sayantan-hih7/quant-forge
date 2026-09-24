import { z } from 'zod';
const mobile = /^(?:\+91[ -]?)?[6-9]\d{9}$/;
export const createAuthSchema = (signup: boolean, otp: boolean) => z.object({
  name: z.string().trim(),
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string(),
  mobile: z.string().trim(),
}).superRefine((values, ctx) => {
  if (signup && values.name.length < 2) ctx.addIssue({ code: 'custom', path: ['name'], message: 'Enter your full name' });
  if ((signup || !otp) && values.password.length < 8) ctx.addIssue({ code: 'custom', path: ['password'], message: 'Use at least 8 characters' });
  if (signup && (!/[A-Z]/.test(values.password) || !/\d/.test(values.password))) ctx.addIssue({ code: 'custom', path: ['password'], message: 'Include an uppercase letter and a number' });
  if ((signup || otp) && !mobile.test(values.mobile)) ctx.addIssue({ code: 'custom', path: ['mobile'], message: 'Enter a valid 10-digit Indian mobile number' });
});
export type AuthFormValues = z.infer<ReturnType<typeof createAuthSchema>>;
export const verificationSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Enter a 6-digit verification code') });
export type VerificationValues = z.infer<typeof verificationSchema>;
