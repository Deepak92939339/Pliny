import { z } from "zod";

export const authFormSchema = z.object({
  name: z.string().trim().max(80, "Name must be 80 characters or less.").optional(),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export type AuthFormValues = z.infer<typeof authFormSchema>;

export const signupFormSchema = authFormSchema.extend({
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const recoveryFormSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

export type RecoveryFormValues = z.infer<typeof recoveryFormSchema>;

export const updatePasswordFormSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(8, "Please confirm your password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type UpdatePasswordFormValues = z.infer<typeof updatePasswordFormSchema>;
