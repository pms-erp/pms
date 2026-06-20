import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectById, getProjectTasks } from "@/lib/projects/service";
import { canManageProjectViewers } from "@/lib/rbac";
import { ProjectHeader } from "./_components/project-header";
import { ProjectStats } from "./_components/project-stats";
import { ProjectInfo } from "./_components/project-info";
import { ProjectTasksTable } from "./_components/project-tasks-table";
import { CreateProjectTaskDialog } from "./_components/create-project-task-dialog";
import { ProjectViewersWrapper } from "./_components/project-viewers-wrapper";
import { ClientManageDialog } from "./_components/client-manage-dialog"; // ✅ NEW
import { ProjectChatPanel } from "./_components/project-chat-panel"; // ✅ NEW
import Link from "next/link";
import { db } from "@/db";
import { projectViewers, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function ProjectDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return notFound();

  const teamType = session.user.team_type ?? null;

  // ── Fetch project + viewers in parallel ───────────────────────────────────
  const [project, viewers] = await Promise.all([
    getProjectById(id, session.user.id, session.user.role, teamType),
    db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        avatar: users.avatar,
        role: users.role,
      })
      .from(projectViewers)
      .innerJoin(users, eq(projectViewers.user_id, users.id))
      .where(eq(projectViewers.project_id, id)),
  ]);

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <div className="text-center space-y-3 max-w-sm">
          <div className="mx-auto h-14 w-14 rounded-full bg-muted flex items-center justify-center">
            <svg
              className="h-7 w-7 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 15v2m0 0v2m0-2h2m-2 0H10m6-6a6 6 0 10-12 0 6 6 0 0012 0z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold">Project Not Found</h2>
          <p className="text-muted-foreground text-sm">
            This project doesn&apos;t exist or you don&apos;t have access to it.
          </p>
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline mt-2"
          >
            ← Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  const tasks = await getProjectTasks(
    id,
    session.user.id,
    session.user.role,
    teamType,
  );

  // ── Permissions ───────────────────────────────────────────────────────────
  const canEdit =
    session.user.role === "ADMIN" || session.user.role === "PROJECT_MANAGER";

  const canManageViewers = canManageProjectViewers(session.user.role);

  // Only ADMIN and PROJECT_MANAGER can manage client portal access
  const canManageClients =
    session.user.role === "ADMIN" || session.user.role === "PROJECT_MANAGER";

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6 w-full min-w-0">
      <ProjectHeader
        projectId={id}
        canEdit={canEdit}
        project={{
          name: project.name,
          client_name: project.client_name ?? null,
          website_url: project.website_url ?? null,
          status: project.status,
        }}
      />

      <ProjectStats
        progress={project.progress}
        totalTasks={project.totalTasks}
        completedTasks={project.completedTasks}
      />

      {/* ── Tasks section ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tasks ({tasks.length})</h2>
        <div className="flex items-center gap-2">
          <ProjectViewersWrapper
            projectId={id}
            projectName={project.name}
            initialViewers={viewers}
            canManage={canManageViewers}
            currentUserRole={session.user.role}
            currentUserTeamType={teamType}
          />

          {/* ✅ Client portal access — ADMIN/PM only */}
          {canManageClients && <ClientManageDialog projectId={id} />}

          {canEdit && (
            <CreateProjectTaskDialog
              projectId={id}
              projectName={project.name}
            />
          )}
        </div>
      </div>

      <ProjectTasksTable
        tasks={tasks}
        hideTitleRow
        userRole={session.user.role}
        userId={session.user.id}
        userName={session.user.name}
      />

      {/* ── Bottom section: Project Info + Chat side by side on desktop ─── */}
      <div className="">
        <ProjectInfo
          projectId={id}
          canEdit={canEdit}
          project={{
            client_name: project.client_name ?? null,
            website_url: project.website_url ?? null,
            fiverr_order_id: project.fiverr_order_id ?? null,
            created_at: project.created_at,
            body: project.body ?? null,
            files: project.files ?? null,
          }}
        />
      </div>
      {/* ✅ Group chat — shown to all staff. Panel handles its own access denial message. */}
      <div className="h-[700px]">
        <ProjectChatPanel projectId={id} />
      </div>
    </div>
  );
}
