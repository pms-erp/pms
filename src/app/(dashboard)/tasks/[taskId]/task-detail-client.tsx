"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  IconArrowLeft,
  IconDotsVertical,
  IconEdit,
  IconUser,
  IconClock,
  IconCalendar,
  IconPaperclip,
  IconDownload,
  IconRefresh,
} from "@tabler/icons-react";
import Link from "next/link";

// Types
type TeamType = "DEVELOPER" | "DESIGNER" | "PROGRAMMER" | string;
type Priority = "LOW" | "MEDIUM" | "HIGH" | string;
type Status = "IN_PROGRESS" | "WAITING_FOR_QA" | "APPROVED" | "REWORK" | string;

export interface TaskFile {
  url: string;
  name?: string;
}

export interface TaskType {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  estimated_minutes?: number | null;
  status: Status;
  team_type: TeamType;
  projectName?: string;
  assigned_to?: string;
  assignedUserName?: string;
  assignedByUsername?: string;
  files?: string;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
  rework_count?: number;
}

export interface TeamMember {
  id: string;
  name: string;
  username: string;
}

interface TaskDetailClientProps {
  task: TaskType;
  userRole: string;
  userId: string;
}

// Roles allowed to see the Actions dropdown
const PRIVILEGED_ROLES = ["TEAM_LEADER", "ADMIN", "PROJECT_MANAGER"];

export function TaskDetailClient({ task, userRole }: TaskDetailClientProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const canManageTask = PRIVILEGED_ROLES.includes(userRole);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "HIGH":
        return "bg-red-100 text-red-700 border-red-200";
      case "MEDIUM":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "LOW":
        return "bg-green-100 text-green-700 border-green-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "IN_PROGRESS":
        return "bg-orange-100 text-orange-700 border-orange-200";
      case "WAITING_FOR_QA":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "APPROVED":
        return "bg-green-100 text-green-700 border-green-200";
      case "REWORK":
        return "bg-red-100 text-red-700 border-red-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getTeamTypeColor = (teamType: string) => {
    switch (teamType) {
      case "DEVELOPER":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "DESIGNER":
        return "bg-pink-100 text-pink-700 border-pink-200";
      case "PROGRAMMER":
        return "bg-indigo-100 text-indigo-700 border-indigo-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const formatTime = (minutes: number | null | undefined) => {
    if (!minutes) return "Not set";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "Not set";
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getFileType = (url: string) => {
    if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return "image";
    if (url.match(/\.(pdf|doc|docx|txt)$/i)) return "document";
    if (url.match(/\.(mp4|webm|mov)$/i)) return "video";
    return "other";
  };

  const handleReassign = async (newAssigneeId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/reassign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to: newAssigneeId }),
      });

      if (!res.ok) throw new Error("Failed to reassign task");

      toast.success("Task reassigned successfully");
      setReassignOpen(false);
      router.refresh();
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error("Failed to reassign task", {
          description: error.message,
        });
      } else {
        toast.error("Failed to reassign task");
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      setTeamMembers(data.data || data.users || data.allUsers || data || []);
    } catch (error) {
      console.error("Failed to fetch team members:", error);
    }
  };

  let files: TaskFile[] = [];
  if (task.files) {
    try {
      const parsed = JSON.parse(task.files);
      if (Array.isArray(parsed)) {
        files = parsed.map((f: unknown) =>
          typeof f === "string"
            ? { url: f }
            : { url: (f as TaskFile).url, name: (f as TaskFile).name },
        );
      }
    } catch {
      files = [];
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/tasks">
              <IconArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{task.title}</h1>
            <p className="text-muted-foreground mt-1">{task.projectName}</p>
          </div>
        </div>

        {/* Actions dropdown — only visible to Team Leaders, Admins, and Project Managers */}
        {canManageTask && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <IconDotsVertical className="h-4 w-4 mr-2" />
                Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <IconEdit className="mr-2 h-4 w-4" />
                    Edit Task
                  </DropdownMenuItem>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Edit Task</DialogTitle>
                  </DialogHeader>
                  <EditTaskForm
                    task={task}
                    onSuccess={() => {
                      setEditOpen(false);
                      router.refresh();
                      toast.success("Task updated successfully");
                    }}
                  />
                </DialogContent>
              </Dialog>

              <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
                <DialogTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setReassignOpen(true);
                      fetchTeamMembers();
                    }}
                  >
                    <IconUser className="mr-2 h-4 w-4" />
                    Reassign
                  </DropdownMenuItem>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Reassign Task</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Label>Assign to</Label>
                    <Select
                      defaultValue={task.assigned_to}
                      onValueChange={handleReassign}
                      disabled={loading}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select team member" />
                      </SelectTrigger>
                      <SelectContent>
                        {teamMembers.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name} (@{member.username})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </DialogContent>
              </Dialog>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Status & Priority Badges */}
      <div className="flex gap-2">
        <Badge variant="outline" className={getTeamTypeColor(task.team_type)}>
          {task.team_type}
        </Badge>
        <Badge variant="outline" className={getPriorityColor(task.priority)}>
          {task.priority}
        </Badge>
        <Badge variant="outline" className={getStatusColor(task.status)}>
          {task.status.replace(/_/g, " ")}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Task Details */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Task Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Description</Label>
              <p className="mt-2 text-sm">
                {task.description || "No description provided"}
              </p>
            </div>

            {files.length > 0 && (
              <div>
                <Label className="text-muted-foreground flex items-center gap-2">
                  <IconPaperclip className="h-4 w-4" />
                  Attachments ({files.length})
                </Label>
                <div className="mt-2 grid gap-2">
                  {files.map((file, index) => {
                    const type = getFileType(file.url);
                    const url = file.url;
                    const name = file.name || `File ${index + 1}`;
                    return (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          {type === "image" && (
                            <img
                              src={url}
                              alt={name}
                              className="h-10 w-10 object-cover rounded"
                            />
                          )}
                          <div>
                            <p className="text-sm font-medium">{name}</p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {type}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" asChild>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <IconDownload className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Task Info */}
        <Card>
          <CardHeader>
            <CardTitle>Task Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground flex items-center gap-2">
                <IconUser className="h-4 w-4" />
                Assigned To
              </Label>
              <div className="mt-2 flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-blue-600 text-white text-xs">
                    {task.assignedUserName?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">
                    {task.assignedUserName || "Unassigned"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    @{task.assignedByUsername}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-muted-foreground flex items-center gap-2">
                <IconClock className="h-4 w-4" />
                Estimated Time
              </Label>
              <p className="mt-2 text-sm font-medium">
                {formatTime(task.estimated_minutes ?? null)}
              </p>
            </div>

            <Separator />

            <div>
              <Label className="text-muted-foreground flex items-center gap-2">
                <IconCalendar className="h-4 w-4" />
                Created
              </Label>
              <p className="mt-2 text-sm">{formatDate(task.created_at)}</p>
            </div>

            {task.updated_at && (
              <>
                <Separator />
                <div>
                  <Label className="text-muted-foreground">Last Updated</Label>
                  <p className="mt-2 text-sm">{formatDate(task.updated_at)}</p>
                </div>
              </>
            )}

            {!!task.rework_count && task.rework_count > 0 && (
              <>
                <Separator />
                <div>
                  <Label className="text-muted-foreground flex items-center gap-2">
                    <IconRefresh className="h-4 w-4" />
                    Rework Count
                  </Label>
                  <p className="mt-2 text-sm font-medium">
                    {task.rework_count}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Edit Task Form Component
interface EditTaskFormProps {
  task: TaskType;
  onSuccess: () => void;
}

interface EditTaskFormData {
  title: string;
  description: string;
  priority: Priority;
  estimated_minutes: string;
}

function EditTaskForm({ task, onSuccess }: EditTaskFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<EditTaskFormData>({
    title: task.title,
    description: task.description || "",
    priority: task.priority,
    estimated_minutes: task.estimated_minutes?.toString() || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Failed to update task");

      onSuccess();
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error("Failed to update task", {
          description: error.message,
        });
      } else {
        toast.error("Failed to update task");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          rows={4}
        />
      </div>

      <div className="space-y-2">
        <Label>Priority</Label>
        <Select
          value={formData.priority}
          onValueChange={(value) =>
            setFormData({ ...formData, priority: value as Priority })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Estimated Time (minutes)</Label>
        <Input
          type="number"
          value={formData.estimated_minutes}
          onChange={(e) =>
            setFormData({ ...formData, estimated_minutes: e.target.value })
          }
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Updating..." : "Update Task"}
      </Button>
    </form>
  );
}
