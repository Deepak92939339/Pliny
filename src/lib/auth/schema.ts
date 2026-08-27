import { z } from "zod";

export const authFormSchema = z.object({
  name: z.string().trim().max(80, "Name must be 80 characters or less.").optional(),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

export type AuthFormValues = z.infer<typeof authFormSchema>;
