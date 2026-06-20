// app/(dashboard)/projects/page.tsx
import { getProjects } from "@/lib/projects/service";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PROJECT_STATUSES, ProjectStatus } from "@/lib/projects/validation";
import { db } from "@/db";
import { projectViewers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ProjectsClient } from "./[id]/_components/projects-client";
// import { AsanaImportDialog } from "./[id]/_components/asana-import-dialog";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const params = await searchParams;
  const statusParam = params.status;
  const search = params.search ?? "";

  const validStatus: ProjectStatus | undefined = PROJECT_STATUSES.includes(
    statusParam as ProjectStatus,
  )
    ? (statusParam as ProjectStatus)
    : undefined;

  // ✅ No limit — fetch ALL matching projects.
  // The DataTable handles client-side pagination (10 per page by default).
  const result = await getProjects({
    userId: session.user.id,
    role: session.user.role,
    teamType: session.user.team_type ?? null,
    status: validStatus,
    search,
    // page and limit removed — not needed for client-side pagination
  });

  // Fetch which projects this user is a viewer of (for card filtering)
  const viewerRows = await db
    .select({ project_id: projectViewers.project_id })
    .from(projectViewers)
    .where(eq(projectViewers.user_id, session.user.id));

  const viewerProjectIds = viewerRows.map((r) => r.project_id);
  const projectViewerCount = viewerProjectIds.length;

  const canCreate =
    session.user.role === "ADMIN" || session.user.role === "PROJECT_MANAGER";

  return (
    <div className="p-6">
      <ProjectsClient
        data={result.data}
        viewerProjectIds={viewerProjectIds}
        projectViewerCount={projectViewerCount}
        canCreate={canCreate}
        search={search}
        total={result.total}
      />
    </div>
  );
}
