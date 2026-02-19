import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  dateOfBirth: z.string().datetime().optional(),
  parentalEmail: z.string().email('Invalid email address').optional(),
  parentalName: z.string().min(2, 'Parent name must be at least 2 characters').max(100).optional(),
}).refine(
  (data) => {
    // If dateOfBirth is provided, parentalEmail and parentalName must also be provided
    if (data.dateOfBirth && (!data.parentalEmail || !data.parentalName)) {
      return false;
    }
    return true;
  },
  {
    message: 'Parental information is required when date of birth is provided',
    path: ['parentalEmail'], // This will point to the parentalEmail field in the error
  }
);

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const setPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
