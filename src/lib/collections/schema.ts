import { z } from "zod";

export const privacyModeSchema = z.enum(["standard", "privacy_minimised"]);

export const collectionFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Project name is required.")
    .max(120, "Project name must be 120 characters or less."),
  description: z
    .string()
    .trim()
    .max(280, "Description must be 280 characters or less.")
    .optional(),
  defaultProcessingMode: privacyModeSchema,
});

export const collectionIdSchema = z.string().uuid("Invalid collection id.");

export type CollectionFormValues = z.infer<typeof collectionFormSchema>;
