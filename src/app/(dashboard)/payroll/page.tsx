// app/(dashboard)/payroll/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PayrollClient } from "./_components/payroll-client";

export default async function PayrollPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { role } = session.user;
  const isAdmin = role === "ADMIN";
  const isTeamLeader = role === "TEAM_LEADER";

  return (
    <PayrollClient
      userId={session.user.id}
      userName={session.user.name ?? ""}
      isAdmin={isAdmin}
      isTeamLeader={isTeamLeader}
    />
  );
}
