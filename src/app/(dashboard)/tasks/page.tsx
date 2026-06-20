import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TasksClient } from "./_components/tasks-client";
import { getTasks, getTaskStats } from "@/lib/tasks/service";

type TaskStatus = "IN_PROGRESS" | "WAITING_FOR_QA" | "APPROVED" | "REWORK";

const ALLOWED_STATUSES: TaskStatus[] = [
  "IN_PROGRESS",
  "WAITING_FOR_QA",
  "APPROVED",
  "REWORK",
];

function isValidStatus(status: string): status is TaskStatus {
  return ALLOWED_STATUSES.includes(status as TaskStatus);
}

export default async function TasksPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{
    status?: string;
    team?: string;
    search?: string;
    page?: string;
  }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  // searchParams is a Promise and must be awaited
  const params = await searchParamsPromise;
  const page = Number(params.page || 1);

  const [tasksData, stats] = await Promise.all([
    getTasks({
      userId: session.user.id,
      role: session.user.role,
      userTeamType: session.user.team_type ?? null,
      status:
        params.status !== undefined && isValidStatus(params.status)
          ? params.status
          : undefined,
      teamType: params.team,
      search: params.search,
      page,
      limit: 10,
    }),
    getTaskStats(
      session.user.id,
      session.user.role,
      session.user.team_type ?? null,
    ),
  ]);

  const serializedTasksData = {
    ...tasksData,
    data: tasksData.data.map((task) => ({
      ...task,
      due_date: task.due_date ? task.due_date.toISOString() : null,
    })),
  };

  return (
    <TasksClient
      initialData={serializedTasksData}
      initialStats={stats}
      initialParams={params}
      userRole={session.user.role}
      userId={session.user.id}
    />
  );
}
