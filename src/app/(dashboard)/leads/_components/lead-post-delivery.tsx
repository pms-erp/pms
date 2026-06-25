"use client";

// src/app/(dashboard)/leads/_components/lead-post-delivery.tsx

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  IconLoader2,
  IconMessageCircle,
  IconCheck,
  IconX,
  IconStar,
  IconStarFilled,
  IconClipboardCheck,
  IconEdit,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { format } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

type FeedbackAttemptRow = {
  id: string;
  feedback_attempt: number;
  feedback_date: string | null;
  collected_by: string | null;
  collected_by_name: string | null;
  rating: number | null;
  feedback_text: string | null;
  status: "PENDING" | "RECEIVED" | "NO_RESPONSE";
  upsell_discussed: boolean;
  upsell_notes: string | null;
  upsell_service_category: string | null;
  upsell_estimated_value: string | null;
  upsell_lead_id: string | null;
  created_at: string;
};

type PostDeliveryState = {
  project_id: string;
  project_name: string;
  project_status: string;
  attempts: FeedbackAttemptRow[];
  currentAttempt: number | null;
  exhausted: boolean;
  received: boolean;
};

type Props = {
  leadId: string;
  canLog: boolean;
  onUpdated?: () => void;
};

// ── Main Component ────────────────────────────────────────────────────────────

export function LeadPostDelivery({ leadId, canLog, onUpdated }: Props) {
  const [states, setStates] = useState<PostDeliveryState[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchState = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/feedback`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStates(data.postDelivery ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleUpdated = () => {
    fetchState();
    onUpdated?.();
  };

  useEffect(() => {
    fetchState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <IconLoader2 size={16} className="animate-spin" />
          Loading post-delivery status…
        </CardContent>
      </Card>
    );
  }

  if (states.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          No post-delivery records yet. This section activates once a linked
          project is marked <strong>Completed</strong>.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {states.map((state) => (
        <ProjectFeedbackCard
          key={state.project_id}
          leadId={leadId}
          state={state}
          canLog={canLog}
          onUpdated={handleUpdated}
        />
      ))}
    </div>
  );
}

// ── Per-project feedback card ─────────────────────────────────────────────────

function ProjectFeedbackCard({
  leadId,
  state,
  canLog,
  onUpdated,
}: {
  leadId: string;
  state: PostDeliveryState;
  canLog: boolean;
  onUpdated: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"log" | "edit">("log");
  const [editingAttempt, setEditingAttempt] =
    useState<FeedbackAttemptRow | null>(null);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FeedbackAttemptRow | null>(
    null,
  );

  const [respondedChoice, setRespondedChoice] = useState<"yes" | "no" | null>(
    null,
  );
  const [feedbackDate, setFeedbackDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [rating, setRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");

  const pendingAttempt = state.attempts.find((a) => a.status === "PENDING");
  const loggedAttempts = state.attempts.filter((a) => a.status !== "PENDING");
  const latestLogged =
    loggedAttempts.length > 0
      ? loggedAttempts[loggedAttempts.length - 1]
      : null;

  const resetForm = () => {
    setRespondedChoice(null);
    setFeedbackDate(new Date().toISOString().split("T")[0]);
    setRating(0);
    setFeedbackText("");
    setFormOpen(false);
    setFormMode("log");
    setEditingAttempt(null);
  };

  const openLogForm = () => {
    setFormMode("log");
    setEditingAttempt(null);
    setRespondedChoice(null);
    setFeedbackDate(new Date().toISOString().split("T")[0]);
    setRating(0);
    setFeedbackText("");
    setFormOpen(true);
  };

  const openEditForm = (attempt: FeedbackAttemptRow) => {
    setFormMode("edit");
    setEditingAttempt(attempt);
    setRespondedChoice(attempt.status === "RECEIVED" ? "yes" : "no");
    setFeedbackDate(
      attempt.feedback_date ?? new Date().toISOString().split("T")[0],
    );
    setRating(attempt.rating ?? 0);
    setFeedbackText(attempt.feedback_text ?? "");
    setFormOpen(true);
  };

  const handleSave = async () => {
    const target = formMode === "edit" ? editingAttempt : pendingAttempt;
    if (!target) return;

    if (respondedChoice === null) {
      toast.error("Please select whether the client responded");
      return;
    }
    if (respondedChoice === "yes" && rating === 0) {
      toast.error("Please select a rating");
      return;
    }

    setSaving(true);
    try {
      const url =
        formMode === "edit"
          ? `/api/leads/${leadId}/feedback/${target.id}`
          : `/api/leads/${leadId}/feedback`;
      const method = formMode === "edit" ? "PATCH" : "POST";

      const payload: Record<string, unknown> = {
        feedback_date: feedbackDate, // ✅ Keep as string "YYYY-MM-DD"
        responded: respondedChoice === "yes",
        rating: respondedChoice === "yes" ? rating : undefined,
        feedback_text: respondedChoice === "yes" ? feedbackText : undefined,
      };
      if (formMode === "log") {
        payload.feedback_id = target.id;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      toast.success(
        formMode === "edit"
          ? "Feedback attempt updated"
          : respondedChoice === "yes"
            ? "Feedback recorded"
            : "Attempt logged — no response",
      );
      resetForm();
      onUpdated();
    } catch (err) {
      toast.error("Failed to save feedback", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/leads/${leadId}/feedback/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");

      toast.success("Feedback attempt removed");
      setDeleteTarget(null);
      onUpdated();
    } catch (err) {
      toast.error("Failed to delete feedback attempt", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <IconClipboardCheck size={16} className="text-primary" />
            Post-Delivery — {state.project_name}
          </h3>
          {state.received && (
            <Badge className="bg-green-100 text-green-700 border border-green-200 hover:bg-green-100">
              Feedback Received
            </Badge>
          )}
          {state.exhausted && !state.received && (
            <Badge className="bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-100">
              No Response
            </Badge>
          )}
        </div>

        <Separator />

        {/* Logged attempts */}
        {loggedAttempts.length > 0 && (
          <div className="space-y-2">
            {loggedAttempts.map((a) => {
              const isLatest = latestLogged?.id === a.id;
              return (
                <div
                  key={a.id}
                  className="bg-muted/50 rounded-md p-3 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1 flex-wrap">
                      {a.status === "RECEIVED" ? (
                        Array.from({ length: 5 }).map((_, i) =>
                          i < (a.rating ?? 0) ? (
                            <IconStarFilled
                              key={i}
                              size={16}
                              className="text-amber-400"
                            />
                          ) : (
                            <IconStar
                              key={i}
                              size={16}
                              className="text-muted-foreground"
                            />
                          ),
                        )
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-gray-100 text-gray-700 border-gray-200"
                        >
                          No Response
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground ml-2">
                        Attempt {a.feedback_attempt} ·{" "}
                        {a.feedback_date
                          ? format(new Date(a.feedback_date), "dd MMM yyyy")
                          : "—"}
                      </span>
                    </div>

                    {/* Edit/Delete — most recent attempt only */}
                    {canLog && isLatest && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => openEditForm(a)}
                          title="Edit this attempt"
                        >
                          <IconEdit size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(a)}
                          title="Delete this attempt"
                        >
                          <IconTrash size={13} />
                        </Button>
                      </div>
                    )}
                  </div>

                  {a.status === "RECEIVED" && a.feedback_text && (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {a.feedback_text}
                    </p>
                  )}
                  {a.collected_by_name && (
                    <p className="text-xs text-muted-foreground">
                      Collected by {a.collected_by_name}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* All 3 exhausted, no response */}
        {state.exhausted && !pendingAttempt && (
          <p className="text-sm text-muted-foreground">
            3 attempts made — no feedback received
          </p>
        )}

        {/* Pending attempt prompt */}
        {pendingAttempt && !state.received && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {pendingAttempt.feedback_attempt === 1 ? (
                <>Project completed. Log your first feedback outreach.</>
              ) : (
                <>
                  Attempt {pendingAttempt.feedback_attempt - 1} had no response.
                  Log attempt {pendingAttempt.feedback_attempt}.
                </>
              )}
            </p>

            {!formOpen && canLog && (
              <Button size="sm" onClick={openLogForm}>
                <IconMessageCircle size={14} className="mr-1.5" />
                Log Attempt {pendingAttempt.feedback_attempt}
              </Button>
            )}

            {!canLog && (
              <p className="text-xs text-muted-foreground italic">
                Only the lead owner or a manager can log feedback attempts.
              </p>
            )}
          </div>
        )}

        {/* Form (shared for Log + Edit) */}
        {formOpen && (
          <div className="border border-primary/30 bg-primary/5 rounded-lg p-3 space-y-3">
            {formMode === "edit" && (
              <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                <IconEdit size={12} />
                Editing attempt {editingAttempt?.feedback_attempt}
              </p>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Date of attempt *</Label>
              <Input
                type="date"
                value={feedbackDate}
                onChange={(e) => setFeedbackDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Did the client respond? *</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={respondedChoice === "yes" ? "default" : "outline"}
                  onClick={() => setRespondedChoice("yes")}
                  className="flex-1"
                >
                  <IconCheck size={14} className="mr-1.5" />
                  Yes
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={respondedChoice === "no" ? "default" : "outline"}
                  onClick={() => setRespondedChoice("no")}
                  className="flex-1"
                >
                  <IconX size={14} className="mr-1.5" />
                  No
                </Button>
              </div>
            </div>

            {respondedChoice === "yes" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Rating *</Label>
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setRating(i + 1)}
                        className="p-0.5 transition-transform hover:scale-110"
                      >
                        {i < rating ? (
                          <IconStarFilled
                            size={22}
                            className="text-amber-400"
                          />
                        ) : (
                          <IconStar
                            size={22}
                            className="text-muted-foreground hover:text-amber-300"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Feedback Text</Label>
                  <Textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    rows={3}
                    placeholder="What did the client say…"
                  />
                </div>
              </>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={resetForm}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving
                  ? "Saving…"
                  : formMode === "edit"
                    ? "Save Changes"
                    : "Save"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this feedback attempt?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the logged outcome for attempt{" "}
              {deleteTarget?.feedback_attempt} and reverts it back to pending so
              it can be logged again. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
