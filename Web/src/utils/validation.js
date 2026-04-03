import { z } from 'zod';

// Common validation schemas
export const emailSchema = z.string()
  .min(1, 'Email is required')
  .email('Invalid email address')
  .max(255, 'Email is too long');

export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long');

export const nameSchema = z.string()
  .min(1, 'Name is required')
  .max(100, 'Name is too long')
  .regex(/^[a-zA-Z\s'-]+$/, 'Name contains invalid characters');

export const phoneSchema = z.string()
  .regex(/^[0-9]{10}$/, 'Phone number must be 10 digits');

// Login validation schemas
export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const judgeLoginSchema = z.object({
  username: z.string()
    .min(1, 'Username is required')
    .max(50, 'Username is too long'),
  password: passwordSchema,
});

// Registration validation schemas
export const playerRegisterSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  gender: z.enum(['male', 'female', 'other'], {
    errorMap: () => ({ message: 'Please select a gender' }),
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const coachRegisterSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  organization: z.string().max(200, 'Organization name is too long').optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

// Password reset schemas
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

// Helper function to validate data
export const validateData = (schema, data) => {
  try {
    const result = schema.safeParse(data);
    if (!result.success) {
      const errors = {};
      result.error.errors.forEach((err) => {
        const path = err.path.join('.');
        errors[path] = err.message;
      });
      return { success: false, errors };
    }
    return { success: true, data: result.data };
  } catch (error) {
    return { success: false, errors: { _general: 'Validation failed' } };
  }
};
