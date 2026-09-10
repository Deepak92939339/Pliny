"use server";

import { redirect } from "next/navigation";
import { getAuthErrorMessage, getSafeAuthErrorMetadata, type AuthProviderError } from "@/lib/auth/errors";
import { rejectPublicSignup } from "@/lib/auth/privateBeta";
import { authFormSchema, type AuthFormValues } from "@/lib/auth/schema";
import { createClient } from "@/lib/supabase/server";

export type AuthActionResult =
  | {
      status: "success";
      message?: string;
    }
  | {
      status: "error";
      message: string;
    };

function logAuthFailure(stage: "login", error: AuthProviderError) {
  console.warn("[auth] request failed", {
    stage,
    ...getSafeAuthErrorMetadata(error),
  });
}

export async function signupWithPassword(values: AuthFormValues): Promise<AuthActionResult> {
  void values;
  return rejectPublicSignup();
}

export async function loginWithPassword(values: AuthFormValues): Promise<AuthActionResult> {
  const parsed = authFormSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid login details.",
    };
  }

  const supabase = await createClient();
  const { email, password } = parsed.data;
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    logAuthFailure("login", error);
    return {
      status: "error",
      message: getAuthErrorMessage(error, "login"),
    };
  }

  return {
    status: "success",
  };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect("/login");
}
