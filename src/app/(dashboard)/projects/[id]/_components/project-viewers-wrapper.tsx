// app/(dashboard)/projects/_components/project-viewers-wrapper.tsx
"use client";

import { useRouter } from "next/navigation";
import {
  ProjectViewersDialog,
  type ProjectViewer,
} from "./project-viewers-dialog";

interface Props {
  projectId: string;
  projectName: string;
  initialViewers: ProjectViewer[];
  canManage: boolean;
  currentUserRole?: string;
  currentUserTeamType?: string | null;
}

export function ProjectViewersWrapper({
  projectId,
  projectName,
  initialViewers,
  canManage,
  currentUserRole,
  currentUserTeamType,
}: Props) {
  const router = useRouter();

  return (
    <ProjectViewersDialog
      projectId={projectId}
      projectName={projectName}
      currentViewers={initialViewers}
      onViewersChanged={() => router.refresh()}
      canManage={canManage}
      currentUserRole={currentUserRole}
      currentUserTeamType={currentUserTeamType}
    />
  );
}
