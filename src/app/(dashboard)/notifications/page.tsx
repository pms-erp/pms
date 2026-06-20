// app/(dashboard)/notifications/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NotificationsClient } from "./_components/notifications-client";
import { getUserNotifications } from "@/lib/notifications/service";

export default async function NotificationsPage() {
  const session = await getServerSession(authOptions);

  if (!session) redirect("/login");

  // NotificationsClient only needs initialData — unread count comes from
  // UnreadCountContext (already loaded globally in the layout)
  const notificationsData = await getUserNotifications(session.user.id, {
    page: 1,
    limit: 50,
  });

  return <NotificationsClient initialData={notificationsData} />;
}
