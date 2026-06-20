"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconUserStar, IconEdit } from "@tabler/icons-react";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";

// Define a type for TeamMember
export interface TeamMember {
  id: string;
  name: string;
  username: string;
  avatar?: string;
}

interface TeamHeaderProps {
  team: {
    team_type: string;
    leader: TeamMember | null;
    members: TeamMember[];
  };
}

export function TeamHeader({ team }: TeamHeaderProps) {
  const router = useRouter();
  const [assigning, setAssigning] = useState(false);

  const handleAssignLeader = async (userId: string) => {
    setAssigning(true);
    try {
      const res = await fetch(`/api/teams/${team.team_type}/leader`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leader_id: userId === "none" ? null : userId }),
      });
      if (!res.ok) throw new Error("Failed to assign leader");
      toast.success("Team leader updated");
      router.refresh();
    } catch {
      toast.error("Failed to update leader");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="mb-6">
        <Link
          href="/team"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 mb-4"
        >
          <IconArrowLeft size={16} />
          Back to Teams
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold capitalize">
              {team.team_type.toLowerCase()} Team
            </h1>
            <p className="text-muted-foreground">
              {team.members.length + (team.leader ? 1 : 0)} members
            </p>
          </div>
          <Button variant="outline" size="sm">
            <IconEdit className="mr-2" size={16} />
            Edit Team
          </Button>
        </div>
      </div>

      {/* Leader Section */}
      <div className="pt-6 border-t">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium flex items-center gap-2">
            <IconUserStar className="text-yellow-500" size={18} />
            Team Leader
          </h3>
          <Select
            value={team.leader?.id || "none"}
            onValueChange={handleAssignLeader}
            disabled={assigning}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Assign leader" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {[team.leader, ...team.members].filter(Boolean).map((user) => (
                <SelectItem key={user!.id} value={user!.id}>
                  {user!.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {team.leader ? (
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <Avatar className="h-12 w-12 ring-2 ring-green-500">
              <AvatarImage src={team.leader.avatar} />
              <AvatarFallback className="bg-green-600 text-white">
                {team.leader.name?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{team.leader.name}</p>
              <p className="text-sm text-muted-foreground">
                @{team.leader.username}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No leader assigned. Select one above.
          </p>
        )}
      </div>
    </Card>
  );
}
