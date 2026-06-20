import { db } from "@/db";
import { users } from "@/db/schema";
import { desc } from "drizzle-orm";
import { DataTable } from "./data-table";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CreateUserDialog } from "./create-user-dialog";

export default async function UsersPage() {
  const session = await getServerSession(authOptions);

  // ✅ Correct: Check if role is in allowed list
  if (!session || !["ADMIN", "PROJECT_MANAGER"].includes(session.user.role)) {
    redirect("/");
  }

  const rawUsers = await db
    .select()
    .from(users)
    .orderBy(desc(users.created_at));

  const allUsers = rawUsers.map((user) => ({
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email ?? null, // ← included
    role: user.role,
    team_type: user.team_type ?? null,
    is_active: user.is_active,
    created_at: user.created_at.toISOString(),
  }));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">User Management</h1>
        <CreateUserDialog currentUserRole={session.user.role} />
      </div>
      {/* ✅ Pass currentUserRole to DataTable */}
      <DataTable data={allUsers} currentUserRole={session.user.role} />
    </div>
  );
}
