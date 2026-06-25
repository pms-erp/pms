"use client";

// src/app/(dashboard)/leads/_components/lead-detail-sheet.tsx

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent } from "@/components/ui/sheet";
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
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import {
  IconEdit,
  IconPlus,
  IconTrash,
  IconExternalLink,
  IconLoader2,
  IconUser,
  IconCalendar,
  IconMapPin,
  IconLink,
  IconCheck,
  IconSearch,
  IconX,
  IconArrowUpRight,
  IconMaximize,
  IconBriefcase,
  IconPhone,
  IconMail,
  IconClock,
  IconTrendingUp,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { LeadPostDelivery } from "./lead-post-delivery";
import { LeadUpsell } from "./lead-upsell";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  changes: string | null;
  performed_by: string;
  performed_by_name: string;
  created_at: string;
};

type LinkedProject = {
  id: string;
  project_id: string;
  project_name: string;
  project_status: string;
  linked_by_name: string | null;
  notes: string | null;
  created_at: string;
};

type ProjectSearchResult = {
  id: string;
  name: string;
  client_name: string | null;
  status: string;
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

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  CONTACTED:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  QUALIFIED:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  PROPOSAL_SENT:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  NEGOTIATION:
    "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  WON: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  LOST: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  ON_HOLD: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-red-100 text-red-700",
};

const PROJECT_STATUS_COLORS: Record<string, string> = {
  PLANNING: "bg-slate-100 text-slate-700",
  ACTIVE: "bg-blue-100 text-blue-700",
  IN_QA: "bg-purple-100 text-purple-700",
  ON_HOLD: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const ACTION_ICON: Record<string, string> = {
  CREATED: "bg-green-500",
  UPDATED: "bg-blue-500",
  STATUS_CHANGED: "bg-purple-500",
  FOLLOWUP_ADDED: "bg-amber-500",
  FOLLOWUP_DELETED: "bg-red-500",
  PROJECT_LINKED: "bg-teal-500",
  PROJECT_UNLINKED: "bg-orange-500",
  PROJECT_COMPLETED: "bg-green-500",
};

const ACTION_BADGE: Record<string, string> = {
  CREATED: "bg-green-100 text-green-700 border-green-200",
  UPDATED: "bg-blue-100 text-blue-700 border-blue-200",
  STATUS_CHANGED: "bg-purple-100 text-purple-700 border-purple-200",
  FOLLOWUP_ADDED: "bg-amber-100 text-amber-700 border-amber-200",
  FOLLOWUP_DELETED: "bg-red-100 text-red-700 border-red-200",
  PROJECT_LINKED: "bg-teal-100 text-teal-700 border-teal-200",
  PROJECT_UNLINKED: "bg-orange-100 text-orange-700 border-orange-200",
  PROJECT_COMPLETED: "bg-green-100 text-green-700 border-green-200",
};

type Tab = "overview" | "followups" | "post-delivery" | "timeline";

// ─── Component ────────────────────────────────────────────────────────────────

export function LeadDetailSheet({
  open,
  leadId,
  onClose,
  onEdit,
  onRefresh,
}: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const canManage =
    session?.user?.role === "ADMIN" ||
    session?.user?.role === "PROJECT_MANAGER";

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  // ── Linked projects ────────────────────────────────────────────────────────
  const [linkedProjects, setLinkedProjects] = useState<LinkedProject[]>([]);
  const [lpLoading, setLpLoading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<ProjectSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkNotes, setLinkNotes] = useState("");
  const [linking, setLinking] = useState(false);
  const [selectedProject, setSelectedProject] =
    useState<ProjectSearchResult | null>(null);

  // ── Follow-ups ─────────────────────────────────────────────────────────────
  const [fuOpen, setFuOpen] = useState(false);
  const [fuSaving, setFuSaving] = useState(false);
  const [fuForm, setFuForm] = useState({
    followup_date: new Date().toISOString().split("T")[0],
    followup_type: "CALL",
    discussion_summary: "",
    next_action: "",
    next_followup_date: "",
  });

  const fetchDetail = useCallback(async (id: string) => {
    setLoading(true);
    setLead(null);
    try {
      const res = await fetch(`/api/leads/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setLead(await res.json());
    } catch {
      toast.error("Failed to load lead details");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLinkedProjects = useCallback(async (id: string) => {
    setLpLoading(true);
    try {
      const res = await fetch(`/api/leads/${id}/link-project`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLinkedProjects(data.linked ?? []);
    } catch {
      // silent
    } finally {
      setLpLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && leadId) {
      setFuOpen(false);
      setLinkOpen(false);
      setActiveTab("overview");
      setLinkedProjects([]);
      fetchDetail(leadId);
      fetchLinkedProjects(leadId);
    }
  }, [open, leadId, fetchDetail, fetchLinkedProjects]);

  // Project search debounce
  useEffect(() => {
    if (!searchQ.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/projects/search?q=${encodeURIComponent(searchQ)}`,
        );
        if (!res.ok) throw new Error();
        setSearchResults((await res.json()).projects ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  const handleLinkProject = async () => {
    if (!selectedProject) {
      toast.error("Select a project first");
      return;
    }
    setLinking(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/link-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: selectedProject.id,
          notes: linkNotes || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Project linked");
      setLinkOpen(false);
      setSelectedProject(null);
      setSearchQ("");
      setLinkNotes("");
      setSearchResults([]);
      fetchLinkedProjects(leadId);
      fetchDetail(leadId);
    } catch {
      toast.error("Failed to link project");
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (project_id: string) => {
    const tid = toast.loading("Unlinking...");
    try {
      const res = await fetch(
        `/api/leads/${leadId}/link-project?project_id=${project_id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      toast.success("Project unlinked", { id: tid });
      fetchLinkedProjects(leadId);
      fetchDetail(leadId);
    } catch {
      toast.error("Failed to unlink", { id: tid });
    }
  };

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
      toast.success("Deleted", { id: tid });
      fetchDetail(leadId);
    } catch {
      toast.error("Failed to delete", { id: tid });
    }
  };

  const tabBtn = (t: Tab, label: string, count?: number) => (
    <button
      onClick={() => setActiveTab(t)}
      className={`flex items-center gap-1.5 px-1 pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        activeTab === t
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
            activeTab === t
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );

  const hasLinkedProject = linkedProjects.length > 0;
  const isCompleted = linkedProjects.some(
    (p) => p.project_status === "COMPLETED",
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent className="p-0 flex flex-col overflow-hidden border-l min-w-[47vw]">
        {loading && (
          <div className="flex items-center justify-center flex-1">
            <IconLoader2
              className="animate-spin text-muted-foreground"
              size={28}
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
            {/* ── Header ── */}
            <div className="px-6 pt-5 pb-0 border-b shrink-0">
              {/* Top row: platform/status badges + action buttons */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground tracking-wide">
                    {lead.platform}
                  </span>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[lead.status]}`}
                  >
                    {lead.status.replace(/_/g, " ")}
                  </span>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORITY_COLORS[lead.priority]}`}
                  >
                    {lead.priority} priority
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      onClose();
                      router.push(`/leads/${lead.id}`);
                    }}
                  >
                    <IconMaximize size={15} />
                    Expand
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      onClose();
                      onEdit(lead.id);
                    }}
                  >
                    <IconEdit size={15} />
                    Edit
                  </Button>
                </div>
              </div>

              {/* Client name */}
              <h2 className="text-2xl font-bold leading-tight mb-1">
                {lead.client_name}
              </h2>

              {/* Meta row */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                {lead.username && (
                  <span className="flex items-center gap-1">
                    <IconUser size={14} />@{lead.username}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <IconCalendar size={14} />
                  {format(new Date(lead.date_received), "dd MMM yyyy")}
                </span>
              </div>

              {/* Quote card */}
              {lead.proposed_quote && (
                <div className="mb-4 inline-flex items-center gap-2 bg-muted/60 rounded-lg px-4 py-2.5">
                  <span className="text-xs text-muted-foreground font-medium">
                    Quote
                  </span>
                  <span className="text-lg font-bold">
                    ${Number(lead.proposed_quote).toLocaleString()}
                  </span>
                </div>
              )}

              {/* Tabs */}
              <div className="flex gap-5 -mb-px">
                {tabBtn("overview", "Overview")}
                {tabBtn("followups", "Follow-ups", lead.followups.length)}
                {tabBtn("post-delivery", "Post-Delivery")}
                {tabBtn("timeline", "Timeline", lead.activity_logs.length)}
              </div>
            </div>

            {/* ── Scrollable Body ── */}
            <div className="flex-1 overflow-y-auto">
              {/* ════ OVERVIEW TAB ════ */}
              {activeTab === "overview" && (
                <div className="p-6 space-y-6">
                  {/* Linked Projects */}
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <IconBriefcase
                          size={15}
                          className="text-muted-foreground"
                        />
                        Linked Projects
                      </h3>
                      {canManage && (
                        <button
                          onClick={() => setLinkOpen((o) => !o)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <IconLink size={13} />
                          Link Project
                        </button>
                      )}
                    </div>

                    {/* Link form */}
                    {linkOpen && canManage && (
                      <div className="mb-3 p-3 border rounded-lg bg-muted/30 space-y-3">
                        <div>
                          <Label className="text-xs mb-1.5 block">
                            Search Project
                          </Label>
                          {selectedProject ? (
                            <div className="flex items-center justify-between p-2 bg-background border rounded-md">
                              <div>
                                <p className="text-sm font-medium">
                                  {selectedProject.name}
                                </p>
                                {selectedProject.client_name && (
                                  <p className="text-xs text-muted-foreground">
                                    {selectedProject.client_name}
                                  </p>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => {
                                  setSelectedProject(null);
                                  setSearchQ("");
                                }}
                              >
                                <IconX size={13} />
                              </Button>
                            </div>
                          ) : (
                            <div className="relative">
                              <IconSearch
                                size={13}
                                className="absolute left-2.5 top-2.5 text-muted-foreground"
                              />
                              <Input
                                className="pl-8 h-8 text-sm"
                                placeholder="Search by name or client..."
                                value={searchQ}
                                onChange={(e) => setSearchQ(e.target.value)}
                              />
                              {(searching ||
                                searchResults.length > 0 ||
                                (searchQ.trim() && !searching)) && (
                                <div className="absolute z-20 w-full mt-1 bg-background border rounded-md shadow-lg max-h-40 overflow-y-auto">
                                  {searching && (
                                    <div className="flex items-center gap-2 p-2.5 text-sm text-muted-foreground">
                                      <IconLoader2
                                        size={13}
                                        className="animate-spin"
                                      />
                                      Searching...
                                    </div>
                                  )}
                                  {!searching &&
                                    searchResults.length === 0 &&
                                    searchQ.trim() && (
                                      <p className="p-2.5 text-sm text-muted-foreground">
                                        No projects found
                                      </p>
                                    )}
                                  {searchResults.map((p) => (
                                    <button
                                      key={p.id}
                                      className="w-full text-left px-3 py-2 hover:bg-muted/60 flex items-center justify-between text-sm"
                                      onClick={() => {
                                        setSelectedProject(p);
                                        setSearchQ("");
                                        setSearchResults([]);
                                      }}
                                    >
                                      <div>
                                        <p className="font-medium text-sm">
                                          {p.name}
                                        </p>
                                        {p.client_name && (
                                          <p className="text-xs text-muted-foreground">
                                            {p.client_name}
                                          </p>
                                        )}
                                      </div>
                                      <span
                                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PROJECT_STATUS_COLORS[p.status] ?? "bg-muted"}`}
                                      >
                                        {p.status}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs mb-1.5 block">
                            Notes (optional)
                          </Label>
                          <Input
                            className="h-8 text-sm"
                            placeholder="e.g. Main delivery project"
                            value={linkNotes}
                            onChange={(e) => setLinkNotes(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              setLinkOpen(false);
                              setSelectedProject(null);
                              setSearchQ("");
                              setLinkNotes("");
                              setSearchResults([]);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            disabled={linking || !selectedProject}
                            onClick={handleLinkProject}
                          >
                            {linking ? "Linking..." : "Link"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {lpLoading ? (
                      <div className="py-4 flex justify-center">
                        <IconLoader2
                          size={20}
                          className="animate-spin text-muted-foreground"
                        />
                      </div>
                    ) : linkedProjects.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        No project linked yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {linkedProjects.map((lp) => (
                          <div
                            key={lp.id}
                            className="flex items-center justify-between p-3 border rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-2 h-2 rounded-full shrink-0 ${lp.project_status === "COMPLETED" ? "bg-green-500" : lp.project_status === "ACTIVE" ? "bg-blue-500" : "bg-muted-foreground"}`}
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {lp.project_name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {lp.project_status.replace(/_/g, " ")}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <a
                                href={`/projects/${lp.project_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <IconExternalLink size={14} />
                              </a>
                              {canManage && (
                                <button
                                  onClick={() => handleUnlink(lp.project_id)}
                                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                                >
                                  <IconTrash size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <div className="border-t" />

                  {/* Contact Information */}
                  <section>
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                      <IconUser size={15} className="text-muted-foreground" />
                      Contact Information
                    </h3>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      {lead.country && (
                        <DetailField
                          icon={<IconMapPin size={13} />}
                          label="Country"
                          value={lead.country}
                        />
                      )}
                      <DetailField
                        icon={<IconUser size={13} />}
                        label="Added By"
                        value={lead.sent_by_name ?? "Unknown"}
                      />
                      {lead.email && (
                        <DetailField
                          icon={<IconMail size={13} />}
                          label="Email"
                          value={lead.email}
                        />
                      )}
                      {lead.phone && (
                        <DetailField
                          icon={<IconPhone size={13} />}
                          label="Phone"
                          value={lead.phone}
                        />
                      )}
                      {lead.profile_url && (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                            <IconLink size={12} />
                            Profile URL
                          </p>
                          <a
                            href={lead.profile_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline flex items-center gap-1 font-medium"
                          >
                            {lead.profile_url.length > 55
                              ? lead.profile_url.slice(0, 55) + "..."
                              : lead.profile_url}
                            <IconExternalLink size={13} />
                          </a>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Project Details */}
                  {(lead.project_title ||
                    lead.service_category ||
                    lead.requirements ||
                    lead.challenges ||
                    lead.expected_timeline) && (
                    <>
                      <div className="border-t" />
                      <section>
                        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                          <IconBriefcase
                            size={15}
                            className="text-muted-foreground"
                          />
                          Project Details
                        </h3>
                        <div className="space-y-3">
                          {(lead.service_category ||
                            lead.expected_timeline) && (
                            <div className="grid grid-cols-2 gap-x-6">
                              {lead.service_category && (
                                <DetailField
                                  label="Service Category"
                                  value={lead.service_category.replace(
                                    /_/g,
                                    " ",
                                  )}
                                />
                              )}
                              {lead.expected_timeline && (
                                <DetailField
                                  icon={<IconClock size={13} />}
                                  label="Expected Timeline"
                                  value={lead.expected_timeline}
                                />
                              )}
                            </div>
                          )}
                          {lead.requirements && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">
                                Requirements
                              </p>
                              <p className="text-sm bg-muted/40 rounded-md px-3 py-2 whitespace-pre-wrap leading-relaxed">
                                {lead.requirements}
                              </p>
                            </div>
                          )}
                          {lead.challenges && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">
                                Challenges
                              </p>
                              <p className="text-sm bg-muted/40 rounded-md px-3 py-2 whitespace-pre-wrap leading-relaxed">
                                {lead.challenges}
                              </p>
                            </div>
                          )}
                        </div>
                      </section>
                    </>
                  )}

                  {/* Notes */}
                  {lead.notes && (
                    <>
                      <div className="border-t" />
                      <section>
                        <h3 className="text-sm font-semibold mb-2">Notes</h3>
                        <p className="text-sm text-muted-foreground bg-muted/40 rounded-md px-3 py-2 whitespace-pre-wrap leading-relaxed">
                          {lead.notes}
                        </p>
                      </section>
                    </>
                  )}
                </div>
              )}

              {/* ════ FOLLOW-UPS TAB ════ */}
              {activeTab === "followups" && (
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Follow-ups</h3>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1"
                      onClick={() => setFuOpen((o) => !o)}
                    >
                      <IconPlus size={14} />
                      Add Follow-up
                    </Button>
                  </div>

                  {fuOpen && (
                    <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs mb-1.5 block">Date *</Label>
                          <Input
                            type="date"
                            className="h-8 text-sm"
                            value={fuForm.followup_date}
                            onChange={(e) =>
                              setFuForm((f) => ({
                                ...f,
                                followup_date: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs mb-1.5 block">Type *</Label>
                          <Select
                            value={fuForm.followup_type}
                            onValueChange={(v) =>
                              setFuForm((f) => ({ ...f, followup_type: v }))
                            }
                          >
                            <SelectTrigger className="h-8 text-sm">
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
                      <div>
                        <Label className="text-xs mb-1.5 block">
                          Discussion Summary *
                        </Label>
                        <Textarea
                          className="text-sm"
                          rows={2}
                          placeholder="What was discussed..."
                          value={fuForm.discussion_summary}
                          onChange={(e) =>
                            setFuForm((f) => ({
                              ...f,
                              discussion_summary: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs mb-1.5 block">
                          Next Action
                        </Label>
                        <Input
                          className="h-8 text-sm"
                          placeholder="Next step..."
                          value={fuForm.next_action}
                          onChange={(e) =>
                            setFuForm((f) => ({
                              ...f,
                              next_action: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs mb-1.5 block">
                          Next Follow-up Date
                        </Label>
                        <Input
                          type="date"
                          className="h-8 text-sm"
                          value={fuForm.next_followup_date}
                          onChange={(e) =>
                            setFuForm((f) => ({
                              ...f,
                              next_followup_date: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setFuOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={handleAddFollowup}
                          disabled={fuSaving}
                        >
                          {fuSaving ? "Saving..." : "Save Follow-up"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {lead.followups.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                        <IconBriefcase size={20} className="opacity-40" />
                      </div>
                      <p className="text-sm font-medium">No follow-ups yet</p>
                      <p className="text-xs mt-1">
                        Add your first follow-up to track progress
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {lead.followups.map((fu) => (
                        <div
                          key={fu.id}
                          className="border rounded-lg p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                {fu.followup_type}
                              </span>
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
                              <button
                                onClick={() => handleDeleteFollowup(fu.id)}
                                className="h-6 w-6 flex items-center justify-center rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                              >
                                <IconTrash size={13} />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {fu.discussion_summary}
                          </p>
                          {fu.next_action && (
                            <div className="flex items-start gap-1.5 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 px-2.5 py-1.5 rounded">
                              <IconCheck
                                size={13}
                                className="text-amber-600 mt-0.5 shrink-0"
                              />
                              <span className="text-amber-800 dark:text-amber-200">
                                <span className="font-semibold">Next: </span>
                                {fu.next_action}
                              </span>
                            </div>
                          )}
                          {fu.next_followup_date && (
                            <div className="flex items-center gap-1.5 text-xs text-blue-600">
                              <IconCalendar size={13} />
                              Next:{" "}
                              {format(
                                new Date(fu.next_followup_date),
                                "dd MMM yyyy",
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ════ POST-DELIVERY TAB ════ */}
              {activeTab === "post-delivery" && (
                <div className="p-6 space-y-4">
                  <LeadPostDelivery
                    leadId={leadId}
                    canLog={
                      session?.user?.role === "ADMIN" ||
                      session?.user?.role === "PROJECT_MANAGER" ||
                      lead?.sent_by === session?.user?.id
                    }
                    onUpdated={() => {
                      fetchDetail(leadId);
                      onRefresh();
                    }}
                  />
                  <LeadUpsell
                    leadId={leadId}
                    canLog={
                      session?.user?.role === "ADMIN" ||
                      session?.user?.role === "PROJECT_MANAGER" ||
                      lead?.sent_by === session?.user?.id
                    }
                    onUpdated={() => {
                      fetchDetail(leadId);
                      onRefresh();
                    }}
                  />
                </div>
              )}

              {/* ════ TIMELINE TAB ════ */}
              {activeTab === "timeline" && (
                <div className="p-6">
                  <h3 className="text-sm font-semibold mb-4">
                    Activity Timeline
                  </h3>

                  {lead.activity_logs.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                      <IconClock
                        size={32}
                        className="mx-auto mb-3 opacity-20"
                      />
                      <p className="text-sm">No activity recorded yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {lead.activity_logs.map((log) => {
                        let changedFields: Record<
                          string,
                          { from: unknown; to: unknown }
                        > = {};
                        try {
                          if (log.changes)
                            changedFields = JSON.parse(log.changes);
                        } catch {}
                        const hasChanges =
                          Object.keys(changedFields).filter(
                            (f) => f !== "project_id",
                          ).length > 0;
                        const timeAgo = formatDistanceToNow(
                          new Date(log.created_at),
                          { addSuffix: true },
                        );

                        return (
                          <div key={log.id} className="flex gap-3">
                            {/* Icon */}
                            <div className="shrink-0 mt-0.5">
                              <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs ${ACTION_ICON[log.action] ?? "bg-muted-foreground"}`}
                              >
                                {log.action === "CREATED"
                                  ? "✓"
                                  : log.action === "UPDATED"
                                    ? "✎"
                                    : log.action === "STATUS_CHANGED"
                                      ? "↔"
                                      : log.action.includes("FOLLOWUP")
                                        ? "📋"
                                        : log.action.includes("PROJECT")
                                          ? "🔗"
                                          : "•"}
                              </div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 border rounded-lg overflow-hidden">
                              <div className="px-4 py-3">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${ACTION_BADGE[log.action] ?? "bg-muted text-muted-foreground border-muted"}`}
                                  >
                                    {log.action.replace(/_/g, " ")}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {timeAgo}
                                  </span>
                                </div>
                                <p className="text-sm font-medium leading-snug">
                                  {log.summary}
                                </p>

                                {hasChanges && (
                                  <div className="mt-2 space-y-1 text-xs">
                                    {Object.entries(changedFields)
                                      .filter(([f]) => f !== "project_id")
                                      .map(([field, { from, to }]) => (
                                        <div
                                          key={field}
                                          className="flex items-center gap-2 flex-wrap"
                                        >
                                          <span className="font-medium text-foreground capitalize">
                                            {field.replace(/_/g, " ")}:
                                          </span>
                                          <span className="text-red-500 line-through opacity-70">
                                            {String(from ?? "—")}
                                          </span>
                                          <span className="text-muted-foreground">
                                            →
                                          </span>
                                          <span className="text-green-600 dark:text-green-400 font-medium">
                                            {String(to ?? "—")}
                                          </span>
                                        </div>
                                      ))}
                                  </div>
                                )}

                                <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                                  <IconUser size={11} />
                                  <span className="font-medium text-foreground">
                                    {log.performed_by_name}
                                  </span>
                                  <span>·</span>
                                  {format(
                                    new Date(log.created_at),
                                    "dd MMM yyyy, HH:mm",
                                  )}
                                </div>
                              </div>
                            </div>
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

// ─── Helper ───────────────────────────────────────────────────────────────────

function DetailField({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
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
