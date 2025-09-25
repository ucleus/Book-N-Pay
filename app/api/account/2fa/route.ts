import { NextResponse, type NextRequest } from "next/server";
import { authenticator } from "otplib";
import { z } from "zod";

import { getRouteHandlerClient, getServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { sanitizeOtpCode } from "@/lib/utils/sanitize";
import { applyRateLimit } from "@/lib/server/rate-limit";
import { getRequestIp } from "@/lib/utils/request";

const TWO_FACTOR_ATTEMPT_LIMIT = 6;
const TWO_FACTOR_WINDOW_MS = 60_000;

const postSchema = z
  .object({
    code: z.string().optional(),
  })
  .optional();

authenticator.options = { window: 1 };

type UserRow = Database["public"]["Tables"]["users"]["Row"] & {
  two_factor_secret: string | null;
  two_factor_enabled: boolean;
};

type ResolvedAccount =
  | { response: NextResponse }
  | { supabase: ReturnType<typeof getServiceRoleClient>; account: UserRow };

async function resolveAccount(): Promise<ResolvedAccount> {
  const authClient = getRouteHandlerClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError) {
    console.error(authError);
    return { response: NextResponse.json({ error: "AUTH_ERROR" }, { status: 500 }) };
  }

  if (!user) {
    return { response: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }) };
  }

  let supabase: ReturnType<typeof getServiceRoleClient>;
  try {
    supabase = getServiceRoleClient();
  } catch (error) {
    console.error(error);
    return { response: NextResponse.json({ error: "Server misconfigured" }, { status: 500 }) };
  }

  const { data: account, error: accountError } = await supabase
    .from("users")
    .select("id, email, phone, role, created_at, two_factor_enabled, two_factor_secret")
    .eq("id", user.id)
    .maybeSingle();

  if (accountError) {
    console.error(accountError);
    return { response: NextResponse.json({ error: "ACCOUNT_LOOKUP_FAILED" }, { status: 500 }) };
  }

  if (!account) {
    return { response: NextResponse.json({ error: "ACCOUNT_NOT_FOUND" }, { status: 404 }) };
  }

  if (account.role !== "provider" && account.role !== "admin") {
    return { response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  }

  return {
    supabase,
    account: {
      ...account,
      two_factor_secret: account.two_factor_secret ?? null,
    } as UserRow,
  };
}

export async function GET() {
  const resolved = await resolveAccount();
  if ("response" in resolved) {
    return resolved.response;
  }

  const { account } = resolved;

  return NextResponse.json({
    enabled: account.two_factor_enabled,
    hasSecret: Boolean(account.two_factor_secret),
  });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveAccount();
  if ("response" in resolved) {
    return resolved.response;
  }

  const { supabase, account } = resolved;

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    body = {};
  }

  const parsed = postSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const ipAddress = getRequestIp(request);
  const rateResult = applyRateLimit({
    key: `account:2fa:${account.id}:${ipAddress}`,
    limit: TWO_FACTOR_ATTEMPT_LIMIT,
    windowMs: TWO_FACTOR_WINDOW_MS,
  });

  const baseHeaders: Record<string, string> = {
    "X-RateLimit-Limit": `${TWO_FACTOR_ATTEMPT_LIMIT}`,
    "X-RateLimit-Window": `${Math.ceil(TWO_FACTOR_WINDOW_MS / 1000)}`,
  };

  if (!rateResult.allowed) {
    return NextResponse.json(
      { error: "Too many attempts" },
      {
        status: 429,
        headers: {
          ...baseHeaders,
          "Retry-After": `${Math.ceil(rateResult.retryAfterMs / 1000)}`,
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const headers = {
    ...baseHeaders,
    "X-RateLimit-Remaining": `${rateResult.remaining}`,
  } satisfies Record<string, string>;

  const requestedCode = parsed.data?.code;

  if (!requestedCode) {
    if (account.two_factor_enabled) {
      return NextResponse.json({ enabled: true }, { headers });
    }

    let secret = account.two_factor_secret;
    if (!secret) {
      secret = authenticator.generateSecret();
      const { error: updateError } = await supabase
        .from("users")
        .update({ two_factor_secret: secret })
        .eq("id", account.id);

      if (updateError) {
        console.error(updateError);
        return NextResponse.json({ error: "Failed to prepare secret" }, { status: 500, headers });
      }
    }

    const otpauthUrl = authenticator.keyuri(account.email, "Book-N-Pay", secret);

    return NextResponse.json(
      {
        enabled: false,
        secret,
        otpauthUrl,
      },
      { headers },
    );
  }

  const sanitizedCode = sanitizeOtpCode(requestedCode);

  if (sanitizedCode.length < 6) {
    return NextResponse.json({ error: "Invalid verification code" }, { status: 400, headers });
  }

  const secret = account.two_factor_secret;
  if (!secret) {
    return NextResponse.json({ error: "Two-factor setup not initialized" }, { status: 400, headers });
  }

  const isValid = authenticator.check(sanitizedCode, secret);

  if (!isValid) {
    return NextResponse.json({ error: "Invalid verification code" }, { status: 400, headers });
  }

  const { error: enableError } = await supabase
    .from("users")
    .update({ two_factor_enabled: true })
    .eq("id", account.id);

  if (enableError) {
    console.error(enableError);
    return NextResponse.json({ error: "Failed to enable two-factor" }, { status: 500, headers });
  }

  return NextResponse.json({ enabled: true }, { headers });
}

export async function DELETE() {
  const resolved = await resolveAccount();
  if ("response" in resolved) {
    return resolved.response;
  }

  const { supabase, account } = resolved;

  if (!account.two_factor_enabled && !account.two_factor_secret) {
    return NextResponse.json({ enabled: false });
  }

  const { error: disableError } = await supabase
    .from("users")
    .update({ two_factor_enabled: false, two_factor_secret: null })
    .eq("id", account.id);

  if (disableError) {
    console.error(disableError);
    return NextResponse.json({ error: "Failed to disable two-factor" }, { status: 500 });
  }

  return NextResponse.json({ enabled: false });
}
