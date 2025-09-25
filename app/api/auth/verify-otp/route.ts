import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteHandlerClient } from "@/lib/supabase/server";
import { sanitizeOtpCode } from "@/lib/utils/sanitize";

const verifySchema = z.object({
  email: z.string().email("Enter a valid email address"),
  token: z.preprocess(
    (value) => sanitizeOtpCode(typeof value === "string" ? value : ""),
    z.string().length(6, "Enter the 6-digit code from your email."),
  ),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = verifySchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", details: result.error.flatten() },
      { status: 400 },
    );
  }

  let supabase;
  try {
    supabase = getRouteHandlerClient();
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "SERVER_CONFIG_ERROR" }, { status: 500 });
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email: result.data.email,
    token: result.data.token,
    type: "email",
  });

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });
  }

  const user = data.user;

  if (!user) {
    return NextResponse.json({ error: "AUTH_FAILURE" }, { status: 401 });
  }

  const { error: profileError } = await supabase
    .from("users")
    .upsert(
      {
        id: user.id,
        email: user.email ?? result.data.email,
        role: "provider",
      },
      { onConflict: "id" },
    );

  if (profileError) {
    console.error(profileError);
    return NextResponse.json({ error: "PROFILE_BOOTSTRAP_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
