import type { NextRequest } from "next/server";

export function getRequestIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const [first] = forwardedFor.split(",");
    if (first) {
      return first.trim();
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  const typedRequest = request as NextRequest & { ip?: string | null };
  return typedRequest.ip ?? "unknown";
}
