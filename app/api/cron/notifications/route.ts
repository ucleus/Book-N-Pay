import { NextResponse, type NextRequest } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/server";
import {
  parseNotificationPayload,
  renderEmailTemplate,
  renderWhatsAppTemplate,
} from "@/lib/domain/notifications";
import type { Database } from "@/types/database";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
type NotificationUpdate = Database["public"]["Tables"]["notifications"]["Update"] & { id: string };

type DispatchResult = {
  status: "sent" | "failed";
  error?: string;
};

function ensureCronAuthorized(request: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return null;
  }

  const header = request.headers.get("authorization");
  if (!header || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  return null;
}

async function dispatchNotification(notification: NotificationRow): Promise<DispatchResult> {
  const payload = parseNotificationPayload(notification.payload);
  if (!payload) {
    return { status: "failed", error: "INVALID_PAYLOAD" };
  }

  try {
    if (notification.channel === "email") {
      const { subject, body } = renderEmailTemplate(payload);
      console.info(`[email] -> ${notification.recipient}\nSubject: ${subject}\n${body}`);
    } else {
      const message = renderWhatsAppTemplate(payload);
      console.info(`[whatsapp] -> ${notification.recipient}\n${message}`);
    }
    return { status: "sent" };
  } catch (error) {
    console.error("Failed to dispatch notification", error);
    return { status: "failed", error: error instanceof Error ? error.message : "UNKNOWN" };
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = ensureCronAuthorized(request);
  if (unauthorized) {
    return unauthorized;
  }

  let supabase;
  try {
    supabase = getServiceRoleClient();
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "SERVER_MISCONFIGURED" }, { status: 500 });
  }

  const { data: pending, error } = await supabase
    .from("notifications")
    .select("id, channel, recipient, payload")
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: true })
    .limit(25);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "FETCH_FAILED" }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0 });
  }

  const updates: NotificationUpdate[] = [];
  let sentCount = 0;
  let failedCount = 0;

  for (const notification of pending) {
    const result = await dispatchNotification(notification as NotificationRow);
    const baseUpdate: NotificationUpdate = {
      id: notification.id,
      status: result.status,
      sent_at: result.status === "sent" ? new Date().toISOString() : null,
    };

    if (result.status === "sent") {
      sentCount += 1;
    } else {
      failedCount += 1;
      if (result.error) {
        console.warn(`Notification ${notification.id} failed: ${result.error}`);
      }
    }

    updates.push(baseUpdate);
  }

  for (const update of updates) {
    const { id, ...fields } = update;
    const { error: updateError } = await supabase.from("notifications").update(fields).eq("id", id);
    if (updateError) {
      console.error("Failed to update notification status", updateError);
    }
  }

  return NextResponse.json({ processed: pending.length, sent: sentCount, failed: failedCount });
}
