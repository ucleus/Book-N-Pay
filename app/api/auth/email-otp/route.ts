import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteHandlerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = requestSchema.safeParse(body);

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

  const emailRedirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/onboarding`;
  const { error } = await supabase.auth.signInWithOtp({
    email: result.data.email,
    options: { emailRedirectTo },
  });

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "FAILED_TO_SEND_CODE" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
