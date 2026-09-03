"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthErrorMessage, getSafeAuthErrorMetadata, type AuthProviderError } from "@/lib/auth/errors";
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

function logAuthFailure(stage: "login" | "signup", error: AuthProviderError) {
  console.warn("[auth] request failed", {
    stage,
    ...getSafeAuthErrorMetadata(error),
  });
}

export async function signupWithPassword(values: AuthFormValues): Promise<AuthActionResult> {
  const parsed = authFormSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid signup details.",
    };
  }

  const supabase = await createClient();
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const { email, password, name } = parsed.data;
  const trimmedName = name?.trim();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: trimmedName ? { full_name: trimmedName } : undefined,
      emailRedirectTo: origin ? `${origin}/login` : undefined,
    },
  });

  if (error) {
    logAuthFailure("signup", error);
    return {
      status: "error",
      message: getAuthErrorMessage(error, "signup"),
    };
  }

  return {
    status: "success",
    message: "Check your email",
  };
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
