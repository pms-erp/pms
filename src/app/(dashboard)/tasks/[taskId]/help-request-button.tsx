"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { IconHelp, IconSend } from "@tabler/icons-react";

interface HelpRequestButtonProps {
  taskId: string;
  taskTitle: string;
  currentUserName: string;
  // The user viewing the page (may or may not be the assignee)
  currentUserId: string;
}

export function HelpRequestButton({
  taskId,
  taskTitle,
  currentUserName,
  currentUserId,
}: HelpRequestButtonProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async (): Promise<void> => {
    if (!message.trim()) {
      toast.error("Please describe what you need help with");
      return;
    }
    setSending(true);
    try {
      // Fetch all privileged users in parallel
      const [admins, pms, tls] = await Promise.all([
        fetch("/api/users?role=ADMIN&limit=100").then(
          (r) => r.json() as Promise<{ id: string }[]>,
        ),
        fetch("/api/users?role=PROJECT_MANAGER&limit=100").then(
          (r) => r.json() as Promise<{ id: string }[]>,
        ),
        fetch("/api/users?role=TEAM_LEADER&limit=100").then(
          (r) => r.json() as Promise<{ id: string }[]>,
        ),
      ]);

      // Privileged users — they get BOTH the DB notification AND the push alert
      const privilegedIds = [
        ...new Set([
          ...admins.map((u) => u.id),
          ...pms.map((u) => u.id),
          ...tls.map((u) => u.id),
        ]),
      ];

      // All DB recipients = privileged + the person who requested help
      // (so the assignee can see it in their /notifications page)
      const userIds = [...new Set([...privilegedIds, currentUserId])];

      // Push ONLY goes to privileged users — assignee does NOT get the push alert
      const pushUserIds = privilegedIds;

      const res = await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds, // everyone who sees it in /notifications
          pushUserIds, // only privileged get the desktop/mobile push
          taskId,
          type: "HELP_REQUEST",
          title: `Help Request: ${taskTitle}`,
          message: `${currentUserName} needs help on task "${taskTitle}": ${message.trim()}`,
        }),
      });

      if (!res.ok) throw new Error("Failed to send");

      toast.success("Help request sent to your team leaders");
      setOpen(false);
      setMessage("");
    } catch {
      toast.error("Failed to send help request");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/30"
        >
          <IconHelp className="h-4 w-4" />
          Need Help
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconHelp className="h-5 w-5 text-orange-500" />
            Request Help
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            Task:{" "}
            <span className="font-medium text-foreground">{taskTitle}</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="help-message">
              Describe what you need help with{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="help-message"
              placeholder="E.g. I'm stuck on the login flow, the API keeps returning 401..."
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={sending}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              This will alert all Admins, Project Managers, and Team Leaders.
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setOpen(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 gap-2 bg-orange-500 hover:bg-orange-600 text-white"
              onClick={handleSend}
              disabled={sending || !message.trim()}
            >
              {sending ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Sending...
                </>
              ) : (
                <>
                  <IconSend className="h-4 w-4" />
                  Send Help Request
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
