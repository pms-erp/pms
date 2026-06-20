import webpush from "web-push";

const vapidPublicKey: string = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
const vapidPrivateKey: string = process.env.VAPID_PRIVATE_KEY!;

webpush.setVapidDetails(
  "mailto:your-email@example.com",
  vapidPublicKey,
  vapidPrivateKey,
);

export interface PushSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
}

export async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushPayload,
): Promise<void> {
  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon || "/favicon.ico",
        badge: payload.badge || "/favicon.ico",
        data: payload.data,
        click_action: "/notifications",
      }),
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 410
    ) {
    } else {
      console.error("Error sending push notification:", error);
      throw error;
    }
  }
}

export function getPublicKey(): string {
  return vapidPublicKey;
}
