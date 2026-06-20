"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconDotsVertical, IconUserX } from "@tabler/icons-react";

export interface TeamMember {
  id: string;
  name: string;
  username: string;
  // Add other member properties if needed
}

interface MemberListProps {
  members: TeamMember[];
  teamType: string;
  leader?: TeamMember | null;
}

export function MemberList({ members, leader }: MemberListProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const handleRemoveFromTeam = async (userId: string) => {
    if (!confirm("Remove this member from the team?")) return;

    setLoading(userId);
    try {
      const res = await fetch(`/api/users/${userId}/team`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_type: null }),
      });
      if (!res.ok) throw new Error("Failed to remove");
      toast.success("Member removed from team");
      router.refresh();
    } catch {
      toast.error("Failed to remove member");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">Team Members</h3>
      </div>

      <div className="space-y-3">
        {members.map((member) => (
          <div
            key={member.id}
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
          >
            <div className="flex items-center gap-4">
              <Avatar>
                <AvatarFallback>
                  {member.name?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{member.name}</p>
                <p className="text-sm text-muted-foreground">
                  @{member.username}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {member.id === leader?.id && (
                <Badge
                  variant="secondary"
                  className="bg-yellow-100 text-yellow-800"
                >
                  Leader
                </Badge>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={loading === member.id}
                  >
                    <IconDotsVertical size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => handleRemoveFromTeam(member.id)}
                    className="text-red-600"
                  >
                    <IconUserX className="mr-2" size={16} />
                    Remove from Team
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}

        {members.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            No members in this team yet.
          </p>
        )}
      </div>
    </Card>
  );
}
