import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DevicesClient } from "./_components/devices-client";

export default async function DevicesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // ✅ Only ADMIN can manage devices; PROJECT_MANAGER can only view assigned
  const canManage = session.user.role === "ADMIN";

  return (
    <DevicesClient
      userRole={session.user.role}
      userId={session.user.id}
      canManage={canManage}
    />
  );
}
