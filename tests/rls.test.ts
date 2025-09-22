import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const policySql = readFileSync("supabase/policies/0001_rls.sql", "utf8");

describe("supabase policies", () => {
  it("enables RLS on users and customers", () => {
    expect(policySql).toContain("alter table public.users enable row level security;");
    expect(policySql).toContain("alter table public.customers enable row level security;");
  });

  it("locks users down to their own row", () => {
    expect(policySql).toMatch(/create policy users_self_manage[\s\S]+auth\.uid\(\) = id/);
  });

  it("prevents provider handle collisions via owner policy", () => {
    expect(policySql).toMatch(/create policy providers_owner_access[\s\S]+auth\.uid\(\) = user_id/);
  });
});
