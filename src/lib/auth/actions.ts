"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthErrorMessage, getSafeAuthErrorMetadata, type AuthProviderError } from "@/lib/auth/errors";
import { resolveAppOrigin } from "@/lib/auth/redirects";
import {
  authFormSchema,
  recoveryFormSchema,
  signupFormSchema,
  updatePasswordFormSchema,
  type AuthFormValues,
  type RecoveryFormValues,
  type UpdatePasswordFormValues,
} from "@/lib/auth/schema";
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

export type OAuthActionResult =
  | {
      status: "success";
      redirectUrl: string;
    }
  | {
      status: "error";
      message: string;
    };

type AuthStage = "login" | "signup" | "recovery" | "update" | "oauth";

function logAuthFailure(stage: AuthStage, error: AuthProviderError) {
  console.warn("[auth] request failed", {
    stage,
    ...getSafeAuthErrorMetadata(error),
  });
}

async function getAppOrigin(): Promise<string> {
  const headerStore = await headers();
  return resolveAppOrigin(headerStore);
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

export async function signupWithPassword(values: AuthFormValues): Promise<AuthActionResult> {
  const parsed = signupFormSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Enter valid signup details.",
    };
  }
  const supabase = await createClient();
  const origin = await getAppOrigin();
  const { email, password } = parsed.data;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: origin ? `${origin}/auth/confirm` : undefined,
    },
  });
  if (error) {
    logAuthFailure("signup", error);
    const code = typeof error.code === "string" ? error.code : "";
    const message = typeof error.message === "string" ? error.message : "";
    if (code === "user_already_exists" || message.includes("already registered")) {
      // Enumeration-safe: an existing address receives the same result as a new one.
      return {
        status: "success",
      };
    }
    return {
      status: "error",
      message: getAuthErrorMessage(error, "signup"),
    };
  }
  return {
    status: "success",
  };
}

export async function signInWithGoogle(): Promise<OAuthActionResult> {
  const supabase = await createClient();
  const origin = await getAppOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: origin ? `${origin}/auth/callback` : undefined,
    },
  });
  if (error || !data.url) {
    if (error) {
      logAuthFailure("oauth", error);
    }
    return {
      status: "error",
      message: "Unable to start Google sign-in right now. Please try again.",
    };
  }
  return {
    redirectUrl: data.url,
    status: "success",
  };
}

export async function requestPasswordReset(values: RecoveryFormValues): Promise<AuthActionResult> {
  const parsed = recoveryFormSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Enter a valid email address.",
    };
  }
  const supabase = await createClient();
  const origin = await getAppOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    // The recovery template sends its token hash to /auth/confirm. That route
    // verifies the OTP, writes the SSR session cookie, then forwards here.
    redirectTo: origin ? `${origin}/auth/confirm` : undefined,
  });
  if (error) {
    // Logged safely; the caller still returns the generic result to avoid enumeration.
    logAuthFailure("recovery", error);
  }
  return {
    status: "success",
  };
}

export async function updateAccountPassword(values: UpdatePasswordFormValues): Promise<AuthActionResult> {
  const parsed = updatePasswordFormSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Enter a valid new password.",
    };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      status: "error",
      message: "This password link is no longer active. Start again from sign in.",
    };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logAuthFailure("update", error);
    return {
      status: "error",
      message: "We couldn't update your password right now. Please try again.",
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
