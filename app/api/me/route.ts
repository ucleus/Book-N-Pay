import { NextResponse } from "next/server";
import { getRouteHandlerClient } from "@/lib/supabase/server";

export async function GET() {
  let supabase;
  try {
    supabase = getRouteHandlerClient();
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "SERVER_CONFIG_ERROR" }, { status: 500 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error(authError);
    return NextResponse.json({ error: "AUTH_ERROR" }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const [{ data: profile }, { data: provider }] = await Promise.all([
    supabase
      .from("users")
      .select("email, phone, role")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("providers")
      .select("id, display_name, handle, currency")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    user: {
      id: user.id,
      email: profile?.email ?? user.email,
      phone: profile?.phone ?? null,
      role: profile?.role ?? "provider",
    },
    provider,
  });
}
