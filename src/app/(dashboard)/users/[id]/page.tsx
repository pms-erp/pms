import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { users, tasks, projects } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  IconArrowLeft,
  IconCheckbox,
  IconClock,
  IconRefresh,
  IconShieldCheck,
} from "@tabler/icons-react";

// Import client components
import { UserProfileForm } from "./user-profile-form";
import { UserTasksTable } from "./user-tasks-table";
import { UserProjectsGrid } from "./user-projects-grid";

// ── Helpers ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  colorClass,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div
          className={`h-11 w-11 rounded-lg flex items-center justify-center ${colorClass}`}
        >
          <Icon size={20} />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "PROJECT_MANAGER"].includes(session.user.role)) {
    redirect("/");
  }

  // ── Fetch user ──────────────────────────────────────────────────────────────
  const userRow = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!userRow) notFound();

  // ── Fetch tasks assigned to user ────────────────────────────────────────────
  const userTasksRaw = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      team_type: tasks.team_type,
      estimated_minutes: tasks.estimated_minutes,
      created_at: tasks.created_at,
      project_id: tasks.project_id,
      project_name: projects.name,
    })
    .from(tasks)
    .leftJoin(projects, eq(tasks.project_id, projects.id))
    .where(eq(tasks.assigned_to, id))
    .orderBy(tasks.created_at);

  const userTasks = userTasksRaw.map((t) => ({
    ...t,
    created_at: t.created_at,
  }));

  // ── Fetch distinct projects ──────────────────────────────────────────────────
  const projectIds = [...new Set(userTasksRaw.map((t) => t.project_id))];

  let userProjects: {
    id: string;
    name: string;
    status: string;
    task_count: number;
  }[] = [];

  if (projectIds.length > 0) {
    const projectRows = await db
      .select({ id: projects.id, name: projects.name, status: projects.status })
      .from(projects)
      .where(or(...projectIds.map((pid) => eq(projects.id, pid))));

    userProjects = projectRows.map((p) => ({
      ...p,
      task_count: userTasksRaw.filter((t) => t.project_id === p.id).length,
    }));
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  const stats = {
    total: userTasksRaw.length,
    in_progress: userTasksRaw.filter((t) => t.status === "IN_PROGRESS").length,
    waiting_qa: userTasksRaw.filter((t) => t.status === "WAITING_FOR_QA")
      .length,
    approved: userTasksRaw.filter((t) => t.status === "APPROVED").length,
    rework: userTasksRaw.filter((t) => t.status === "REWORK").length,
  };

  return (
    <div className="p-6 space-y-8">
      {/* ── Back button ── */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/users">
            <IconArrowLeft size={20} />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">User Profile</h1>
          <p className="text-sm text-muted-foreground">
            Full details for {userRow.name}
          </p>
        </div>
      </div>

      {/* ── Inline Editable Profile Card ── */}
      <UserProfileForm
        initialUser={userRow}
        currentUserRole={session.user.role}
      />

      {/* ── Task Stats ── */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Task Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard
            icon={IconCheckbox}
            label="Total Tasks"
            value={stats.total}
            colorClass="bg-slate-100 text-slate-600"
          />
          <StatCard
            icon={IconClock}
            label="In Progress"
            value={stats.in_progress}
            colorClass="bg-blue-100 text-blue-600"
          />
          <StatCard
            icon={IconShieldCheck}
            label="Waiting QA"
            value={stats.waiting_qa}
            colorClass="bg-amber-100 text-amber-600"
          />
          <StatCard
            icon={IconCheckbox}
            label="Approved"
            value={stats.approved}
            colorClass="bg-green-100 text-green-600"
          />
          <StatCard
            icon={IconRefresh}
            label="Rework"
            value={stats.rework}
            colorClass="bg-red-100 text-red-600"
          />
        </div>
      </div>

      {/* ── Projects (With Load More) ─ */}
      <div>
        <h2 className="text-lg font-semibold mb-4">
          Projects
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({userProjects.length})
          </span>
        </h2>
        <UserProjectsGrid projects={userProjects} />
      </div>

      {/* ── Tasks Table ── */}
      <div>
        <h2 className="text-lg font-semibold mb-4">
          Tasks
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({userTasks.length})
          </span>
        </h2>
        <UserTasksTable tasks={userTasks} />
      </div>
    </div>
  );
}
