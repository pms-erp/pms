"use client";

// src/app/(dashboard)/leads/_components/lead-detail-sheet.tsx

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import {
  IconEdit,
  IconPlus,
  IconTrash,
  IconExternalLink,
  IconLoader2,
  IconHistory,
  IconMessages,
  IconUser,
  IconBriefcase,
  IconCash,
  IconCalendar,
  IconMapPin,
  IconMail,
  IconPhone,
  IconLink,
  IconNotes,
  IconChartBar,
  IconClock,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

type Followup = {
  id: string;
  followup_date: string;
  followup_type: string;
  discussion_summary: string;
  next_action: string | null;
  next_followup_date: string | null;
  created_by_name: string | null;
};

type ActivityLog = {
  id: string;
  action: string;
  summary: string;
  changes: string | null; // JSON string
  performed_by: string;
  performed_by_name: string;
  created_at: string;
};

export type LeadDetail = {
  id: string;
  platform: string;
  client_name: string;
  username: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  profile_url: string | null;
  date_received: string;
  project_title: string | null;
  service_category: string | null;
  status: string;
  priority: string;
  budget: string | null;
  proposed_quote: string | null;
  estimated_cost: string | null;
  expected_timeline: string | null;
  deal_value: string | null;
  requirements: string | null;
  challenges: string | null;
  notes: string | null;
  lost_reason: string | null;
  follow_up_date: string | null;
  next_follow_up_date: string | null;
  sent_by: string;
  sent_by_name: string | null;
  sent_by_avatar: string | null;
  platform_data: Record<string, string>;
  followups: Followup[];
  activity_logs: ActivityLog[];
  total_followups?: number;
};

type Props = {
  open: boolean;
  leadId: string;
  onClose: () => void;
  onEdit: (leadId: string) => void;
  onRefresh: () => void;
};

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  CONTACTED:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  QUALIFIED:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  PROPOSAL_SENT:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  NEGOTIATION:
    "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  WON: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  LOST: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  ON_HOLD: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  MEDIUM:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  HIGH: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const ACTION_COLORS: Record<string, string> = {
  CREATED: "bg-green-100 text-green-700 border-green-200",
  UPDATED: "bg-blue-100 text-blue-700 border-blue-200",
  STATUS_CHANGED: "bg-purple-100 text-purple-700 border-purple-200",
  FOLLOWUP_ADDED: "bg-amber-100 text-amber-700 border-amber-200",
  FOLLOWUP_DELETED: "bg-red-100 text-red-700 border-red-200",
};

type Tab = "details" | "followups" | "activity";

// ─── Component ────────────────────────────────────────────────────────────────

export function LeadDetailSheet({
  open,
  leadId,
  onClose,
  onEdit,
  onRefresh,
}: Props) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("details");

  const [fuOpen, setFuOpen] = useState(false);
  const [fuSaving, setFuSaving] = useState(false);
  const [fuForm, setFuForm] = useState({
    followup_date: new Date().toISOString().split("T")[0],
    followup_type: "CALL",
    discussion_summary: "",
    next_action: "",
    next_followup_date: "",
  });

  const fetchDetail = async (id: string) => {
    setLoading(true);
    setLead(null);
    try {
      const res = await fetch(`/api/leads/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLead(data);
    } catch {
      toast.error("Failed to load lead details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && leadId) {
      setFuOpen(false);
      setActiveTab("details");
      fetchDetail(leadId);
    }
  }, [open, leadId]);

  const handleAddFollowup = async () => {
    if (!fuForm.discussion_summary.trim()) {
      toast.error("Discussion summary is required");
      return;
    }
    setFuSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/followups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fuForm),
      });
      if (!res.ok) throw new Error();
      toast.success("Follow-up added");
      setFuForm({
        followup_date: new Date().toISOString().split("T")[0],
        followup_type: "CALL",
        discussion_summary: "",
        next_action: "",
        next_followup_date: "",
      });
      setFuOpen(false);
      fetchDetail(leadId);
      onRefresh();
    } catch {
      toast.error("Failed to save follow-up");
    } finally {
      setFuSaving(false);
    }
  };

  const handleDeleteFollowup = async (fid: string) => {
    const tid = toast.loading("Deleting...");
    try {
      const res = await fetch(
        `/api/leads/${leadId}/followups?followup_id=${fid}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      toast.success("Follow-up deleted", { id: tid });
      fetchDetail(leadId);
    } catch {
      toast.error("Failed to delete follow-up", { id: tid });
    }
  };

  const tabClass = (t: Tab) =>
    `px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
      activeTab === t
        ? "border-primary text-primary bg-primary/5"
        : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
    }`;

  const formatCurrency = (value: string | null) => {
    if (!value) return null;
    return `$${Number(value).toLocaleString()}`;
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent className="w-[550px] sm:w-[700px] p-0 flex flex-col overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center flex-1">
            <IconLoader2
              className="animate-spin text-muted-foreground"
              size={32}
            />
          </div>
        )}

        {!loading && !lead && (
          <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
            Lead not found
          </div>
        )}

        {!loading && lead && (
          <>
            {/* ── Enhanced Header ── */}
            <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0 bg-muted/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">
                      {lead.platform}
                    </Badge>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[lead.status]}`}
                    >
                      {lead.status.replace(/_/g, " ")}
                    </span>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORITY_COLORS[lead.priority]}`}
                    >
                      {lead.priority}
                    </span>
                  </div>
                  <SheetTitle className="text-xl leading-tight truncate">
                    {lead.client_name}
                  </SheetTitle>
                  {lead.username && (
                    <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                      <IconUser size={14} />@{lead.username}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onClose();
                    onEdit(lead.id);
                  }}
                >
                  <IconEdit size={16} className="mr-1.5" />
                  Edit
                </Button>
              </div>

              {/* ── Tabs ─ */}
              <div className="flex gap-1 mt-4 -mb-4">
                <button
                  className={tabClass("details")}
                  onClick={() => setActiveTab("details")}
                >
                  <span className="flex items-center gap-2">
                    <IconBriefcase size={16} />
                    Details
                  </span>
                </button>
                <button
                  className={tabClass("followups")}
                  onClick={() => setActiveTab("followups")}
                >
                  <span className="flex items-center gap-2">
                    <IconMessages size={16} />
                    Follow-ups
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {lead.followups.length}
                    </Badge>
                  </span>
                </button>
                <button
                  className={tabClass("activity")}
                  onClick={() => setActiveTab("activity")}
                >
                  <span className="flex items-center gap-2">
                    <IconHistory size={16} />
                    Activity
                  </span>
                </button>
              </div>
            </SheetHeader>

            {/* ── Scrollable body ── */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-muted/20">
              {/* ════════════════ DETAILS TAB ════════════════ */}
              {activeTab === "details" && (
                <div className="space-y-5">
                  {/* Contact Information */}
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <IconUser size={16} className="text-primary" />
                        Contact Information
                      </h3>
                      <Separator className="my-2" />
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <InfoRow
                          icon={<IconCalendar size={14} />}
                          label="Date Received"
                          value={format(
                            new Date(lead.date_received),
                            "dd MMM yyyy",
                          )}
                        />
                        <InfoRow
                          icon={<IconMapPin size={14} />}
                          label="Country"
                          value={lead.country}
                        />
                        <InfoRow
                          icon={<IconMail size={14} />}
                          label="Email"
                          value={lead.email}
                        />
                        <InfoRow
                          icon={<IconPhone size={14} />}
                          label="Phone"
                          value={lead.phone}
                        />
                        {lead.profile_url && (
                          <div className="col-span-2">
                            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                              <IconLink size={12} />
                              Profile URL
                            </p>
                            <a
                              href={lead.profile_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
                            >
                              {lead.profile_url.length > 60
                                ? lead.profile_url.slice(0, 60) + "..."
                                : lead.profile_url}
                              <IconExternalLink size={14} />
                            </a>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Project Details */}
                  {(lead.project_title ||
                    lead.requirements ||
                    lead.challenges ||
                    lead.budget) && (
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <IconBriefcase size={16} className="text-primary" />
                          Project Details
                        </h3>
                        <Separator className="my-2" />
                        {lead.project_title && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">
                              Project Title
                            </p>
                            <p className="text-sm font-semibold">
                              {lead.project_title}
                            </p>
                          </div>
                        )}
                        {lead.service_category && (
                          <InfoRow
                            label="Service Category"
                            value={lead.service_category.replace(/_/g, " ")}
                          />
                        )}

                        <div className="grid grid-cols-3 gap-3 pt-2">
                          {lead.budget && (
                            <MetricCard
                              icon={<IconCash size={16} />}
                              label="Budget"
                              value={formatCurrency(lead.budget)}
                            />
                          )}
                          {lead.proposed_quote && (
                            <MetricCard
                              icon={<IconChartBar size={16} />}
                              label="Quote"
                              value={formatCurrency(lead.proposed_quote)}
                            />
                          )}
                          {lead.deal_value && (
                            <MetricCard
                              icon={<IconCheck size={16} />}
                              label="Deal Value"
                              value={formatCurrency(lead.deal_value)}
                            />
                          )}
                        </div>

                        {lead.expected_timeline && (
                          <InfoRow
                            icon={<IconClock size={14} />}
                            label="Expected Timeline"
                            value={lead.expected_timeline}
                          />
                        )}

                        {lead.requirements && (
                          <div className="pt-2">
                            <p className="text-xs text-muted-foreground mb-1">
                              Requirements
                            </p>
                            <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-md">
                              {lead.requirements}
                            </p>
                          </div>
                        )}
                        {lead.challenges && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">
                              Challenges
                            </p>
                            <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-md">
                              {lead.challenges}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Platform-specific Data */}
                  {Object.entries(lead.platform_data ?? {}).filter(([, v]) => v)
                    .length > 0 && (
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <IconLink size={16} className="text-primary" />
                          {lead.platform} Details
                        </h3>
                        <Separator className="my-2" />
                        <div className="grid grid-cols-2 gap-3">
                          {Object.entries(lead.platform_data)
                            .filter(([, v]) => v)
                            .map(([k, v]) => (
                              <InfoRow
                                key={k}
                                label={k.replace(/_/g, " ")}
                                value={v}
                              />
                            ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Notes */}
                  {lead.notes && (
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <IconNotes size={16} className="text-primary" />
                          Notes
                        </h3>
                        <Separator className="my-2" />
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/50 p-3 rounded-md">
                          {lead.notes}
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Meta Info */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                    <span>Added by {lead.sent_by_name ?? "Unknown"}</span>
                    <span>
                      {format(new Date(lead.date_received), "dd MMM yyyy")}
                    </span>
                  </div>
                </div>
              )}

              {/* ════════════════ FOLLOW-UPS TAB ════════════════ */}
              {activeTab === "followups" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Follow-ups</h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setFuOpen((o) => !o)}
                    >
                      <IconPlus size={16} className="mr-1.5" />
                      Add Follow-up
                    </Button>
                  </div>

                  {fuOpen && (
                    <Card className="border-primary/50 bg-primary/5">
                      <CardContent className="p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Date *</Label>
                            <Input
                              type="date"
                              value={fuForm.followup_date}
                              onChange={(e) =>
                                setFuForm((f) => ({
                                  ...f,
                                  followup_date: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Type *</Label>
                            <Select
                              value={fuForm.followup_type}
                              onValueChange={(v) =>
                                setFuForm((f) => ({ ...f, followup_type: v }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[
                                  "CALL",
                                  "EMAIL",
                                  "FIVERR",
                                  "UPWORK",
                                  "MEETING",
                                  "MESSAGE",
                                  "OTHER",
                                ].map((t) => (
                                  <SelectItem key={t} value={t}>
                                    {t}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">
                            Discussion Summary *
                          </Label>
                          <Textarea
                            value={fuForm.discussion_summary}
                            onChange={(e) =>
                              setFuForm((f) => ({
                                ...f,
                                discussion_summary: e.target.value,
                              }))
                            }
                            rows={2}
                            placeholder="What was discussed..."
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Next Action</Label>
                          <Input
                            value={fuForm.next_action}
                            onChange={(e) =>
                              setFuForm((f) => ({
                                ...f,
                                next_action: e.target.value,
                              }))
                            }
                            placeholder="Next step..."
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Next Follow-up Date</Label>
                          <Input
                            type="date"
                            value={fuForm.next_followup_date}
                            onChange={(e) =>
                              setFuForm((f) => ({
                                ...f,
                                next_followup_date: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="flex gap-2 justify-end pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setFuOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleAddFollowup}
                            disabled={fuSaving}
                          >
                            {fuSaving ? "Saving..." : "Save Follow-up"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {lead.followups.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <IconMessages
                        size={48}
                        className="mx-auto mb-3 opacity-20"
                      />
                      <p className="text-sm">No follow-ups yet</p>
                      <p className="text-xs mt-1">
                        Add your first follow-up to track progress
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {lead.followups.map((fu, idx) => (
                        <Card
                          key={fu.id}
                          className={idx === 0 ? "border-primary/50" : ""}
                        >
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {fu.followup_type}
                                </Badge>
                                <span className="text-sm font-medium">
                                  {format(
                                    new Date(fu.followup_date),
                                    "dd MMM yyyy",
                                  )}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {fu.created_by_name}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDeleteFollowup(fu.id)}
                                >
                                  <IconTrash size={14} />
                                </Button>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {fu.discussion_summary}
                            </p>
                            {fu.next_action && (
                              <div className="flex items-start gap-1.5 text-xs bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                                <IconCheck
                                  size={14}
                                  className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"
                                />
                                <span className="text-amber-800 dark:text-amber-200">
                                  <span className="font-semibold">Next:</span>{" "}
                                  {fu.next_action}
                                </span>
                              </div>
                            )}
                            {fu.next_followup_date && (
                              <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                                <IconCalendar size={14} />
                                Next follow-up:{" "}
                                {format(
                                  new Date(fu.next_followup_date),
                                  "dd MMM yyyy",
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ════════════════ ACTIVITY LOG TAB ════════════════ */}
              {activeTab === "activity" && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Activity Log</h3>

                  {lead.activity_logs.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <IconHistory
                        size={48}
                        className="mx-auto mb-3 opacity-20"
                      />
                      <p className="text-sm">No activity recorded yet</p>
                    </div>
                  ) : (
                    <div className="relative space-y-4 pl-4">
                      {/* Timeline line */}
                      <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />

                      {lead.activity_logs.map((log) => {
                        let changedFields: Record<
                          string,
                          { from: unknown; to: unknown }
                        > = {};
                        try {
                          if (log.changes)
                            changedFields = JSON.parse(log.changes);
                        } catch {}

                        return (
                          <div key={log.id} className="relative flex gap-4">
                            {/* Timeline dot */}
                            <div
                              className={`absolute left-0 top-1 h-4 w-4 rounded-full border-2 border-background shrink-0 ${ACTION_COLORS[log.action]?.includes("green") ? "bg-green-500" : ACTION_COLORS[log.action]?.includes("blue") ? "bg-blue-500" : ACTION_COLORS[log.action]?.includes("red") ? "bg-red-500" : "bg-muted-foreground"}`}
                            />

                            <Card className="flex-1 ml-4">
                              <CardContent className="p-3 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] ${ACTION_COLORS[log.action] ?? "bg-muted"}`}
                                    >
                                      {log.action.replace(/_/g, " ")}
                                    </Badge>
                                    <span className="text-sm font-medium">
                                      {log.summary}
                                    </span>
                                  </div>
                                </div>

                                {Object.keys(changedFields).length > 0 && (
                                  <div className="space-y-1 mt-2 pt-2 border-t text-xs">
                                    {Object.entries(changedFields).map(
                                      ([field, { from, to }]) => (
                                        <div
                                          key={field}
                                          className="flex items-center gap-2 text-muted-foreground flex-wrap"
                                        >
                                          <span className="font-medium capitalize text-foreground">
                                            {field.replace(/_/g, " ")}:
                                          </span>
                                          <span className="line-through text-red-500/70">
                                            {String(from ?? "—")}
                                          </span>
                                          <IconChevronRight size={12} />
                                          <span className="text-green-600 dark:text-green-400 font-medium">
                                            {String(to ?? "—")}
                                          </span>
                                        </div>
                                      ),
                                    )}
                                  </div>
                                )}

                                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                                  <IconUser size={12} />
                                  <span className="font-medium text-foreground">
                                    {log.performed_by_name}
                                  </span>
                                  <span>·</span>
                                  <IconClock size={12} />
                                  <span>
                                    {format(
                                      new Date(log.created_at),
                                      "dd MMM yyyy, HH:mm",
                                    )}
                                  </span>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Helper Components ────────────────────────────────────────────────────────

// ─── Helper Components ────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div className="bg-muted/50 p-3 rounded-lg border">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <p className="text-base font-bold text-foreground">{value}</p>
    </div>
  );
}

function IconChevronRight({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
