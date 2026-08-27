"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { collectionFormSchema, collectionIdSchema, type CollectionFormValues } from "@/lib/collections/schema";
import { createClient } from "@/lib/supabase/server";

export type CollectionActionResult =
  | {
      status: "success";
      message?: string;
    }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<Record<keyof CollectionFormValues, string>>;
    };

function safeDatabaseMessage() {
  return "Unable to save this project right now. Please try again.";
}

export async function createCollection(values: CollectionFormValues): Promise<CollectionActionResult> {
  const parsed = collectionFormSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the project details.",
      fieldErrors: {
        name: parsed.error.flatten().fieldErrors.name?.[0],
        description: parsed.error.flatten().fieldErrors.description?.[0],
      },
    };
  }

  const user = await getCurrentUser();

  if (!user) {
    return {
      status: "error",
      message: "Please log in again before creating a project.",
    };
  }

  const supabase = await createClient();
  const description = parsed.data.description?.trim();
  const { error } = await supabase.from("collections").insert({
    user_id: user.id,
    name: parsed.data.name.trim(),
    description: description ? description : null,
  });

  if (error) {
    return {
      status: "error",
      message: safeDatabaseMessage(),
    };
  }

  revalidatePath("/dashboard");

  return {
    status: "success",
    message: "Project created.",
  };
}

export async function deleteCollection(collectionId: string): Promise<CollectionActionResult> {
  const parsed = collectionIdSchema.safeParse(collectionId);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Unable to delete this project.",
    };
  }

  const user = await getCurrentUser();

  if (!user) {
    return {
      status: "error",
      message: "Please log in again before deleting a project.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("collections")
    .delete()
    .eq("id", parsed.data)
    .eq("user_id", user.id);

  if (error) {
    return {
      status: "error",
      message: "Unable to delete this project right now. Please try again.",
    };
  }

  revalidatePath("/dashboard");

  return {
    status: "success",
    message: "Project deleted.",
  };
}
