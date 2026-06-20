import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { IconCheck, IconList } from "@tabler/icons-react";

interface ProjectStatsProps {
  progress: number;
  totalTasks: number;
  completedTasks: number;
}

export function ProjectStats({
  progress,
  totalTasks,
  completedTasks,
}: ProjectStatsProps) {
  return (
    <div className="grid md:grid-cols-3 gap-6">
      {/* Progress Card */}
      <Card className="border-2">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">
              Progress
            </p>
            <span className="text-2xl font-bold">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {completedTasks} of {totalTasks} tasks completed
          </p>
        </CardContent>
      </Card>

      {/* Total Tasks Card */}
      <Card className="border-2">
        <CardContent className="p-6 space-y-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <IconList className="h-5 w-5" />
            <p className="text-sm font-medium">Total Tasks</p>
          </div>
          <p className="text-3xl font-bold">{totalTasks}</p>
        </CardContent>
      </Card>

      {/* Completed Tasks Card */}
      <Card className="border-2">
        <CardContent className="p-6 space-y-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <IconCheck className="h-5 w-5" />
            <p className="text-sm font-medium">Completed Tasks</p>
          </div>
          <p className="text-3xl font-bold">{completedTasks}</p>
        </CardContent>
      </Card>
    </div>
  );
}
