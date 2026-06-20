"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  userId: string;
  username: string;
  is_active: boolean;
}

export function ToggleUserStatusDialog({ userId, username, is_active }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleToggle() {
    setLoading(true);

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      toast.success(is_active ? "User deactivated" : "User reactivated");

      setOpen(false);
      router.refresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={is_active ? "destructive" : "default"} size="sm">
          {is_active ? "Deactivate" : "Activate"}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {is_active ? `Deactivate ${username}?` : `Activate ${username}?`}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {is_active
            ? "User will not be able to login."
            : "User will regain access to the system."}
        </p>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>

          <Button
            variant={is_active ? "destructive" : "default"}
            onClick={handleToggle}
            disabled={loading}
          >
            {loading
              ? "Processing..."
              : is_active
                ? "Confirm Deactivate"
                : "Confirm Activate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
