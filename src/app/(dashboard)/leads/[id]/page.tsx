"use client";

// src/app/(dashboard)/leads/[id]/page.tsx
// Full-page version of lead detail — same data, same tabs, expanded layout

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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
import { format, formatDistanceToNow } from "date-fns";
import {
  IconArrowLeft,
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
  IconBriefcase,
  IconPhone,
  IconMail,
  IconClock,
  IconTrendingUp,
} from "@tabler/icons-react";
import { toast } from "sonner";
import type { LeadDetail } from "../_components/lead-detail-sheet";
import { LeadDialog } from "../_components/lead-dialog";
import { LeadPostDelivery } from "../_components/lead-post-delivery";
import { LeadUpsell } from "../_components/lead-upsell";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700",
  CONTACTED: "bg-yellow-100 text-yellow-700",
  QUALIFIED: "bg-purple-100 text-purple-700",
  PROPOSAL_SENT: "bg-orange-100 text-orange-700",
  NEGOTIATION: "bg-pink-100 text-pink-700",
  WON: "bg-green-100 text-green-700",
  LOST: "bg-red-100 text-red-700",
  ON_HOLD: "bg-gray-100 text-gray-700",
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

const ACTION_COLOR: Record<string, string> = {
  CREATED: "bg-green-500",
  UPDATED: "bg-blue-500",
  STATUS_CHANGED: "bg-purple-500",
  FOLLOWUP_ADDED: "bg-amber-500",
  FOLLOWUP_DELETED: "bg-red-500",
  PROJECT_LINKED: "bg-teal-500",
  PROJECT_UNLINKED: "bg-orange-500",
  PROJECT_COMPLETED: "bg-green-500",
};

type Tab = "overview" | "followups" | "post-delivery" | "timeline";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const canManage =
    session?.user?.role === "ADMIN" ||
    session?.user?.role === "PROJECT_MANAGER";

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);

  // Linked projects
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

  // Follow-ups
  const [fuOpen, setFuOpen] = useState(false);
  const [fuSaving, setFuSaving] = useState(false);
  const [fuForm, setFuForm] = useState({
    followup_date: new Date().toISOString().split("T")[0],
    followup_type: "CALL",
    discussion_summary: "",
    next_action: "",
    next_followup_date: "",
  });

  const fetchLead = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setLead(await res.json());
    } catch {
      toast.error("Failed to load lead");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchLinkedProjects = useCallback(async () => {
    setLpLoading(true);
    try {
      const res = await fetch(`/api/leads/${id}/link-project`);
      if (!res.ok) throw new Error();
      setLinkedProjects((await res.json()).linked ?? []);
    } catch {
      // silent
    } finally {
      setLpLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLead();
    fetchLinkedProjects();
  }, [fetchLead, fetchLinkedProjects]);

  // Project search
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
    if (!selectedProject) return;
    setLinking(true);
    try {
      await fetch(`/api/leads/${id}/link-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: selectedProject.id,
          notes: linkNotes || undefined,
        }),
      });
      toast.success("Project linked");
      setLinkOpen(false);
      setSelectedProject(null);
      setSearchQ("");
      setLinkNotes("");
      setSearchResults([]);
      fetchLinkedProjects();
      fetchLead();
    } catch {
      toast.error("Failed to link project");
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (project_id: string) => {
    const tid = toast.loading("Unlinking...");
    try {
      await fetch(`/api/leads/${id}/link-project?project_id=${project_id}`, {
        method: "DELETE",
      });
      toast.success("Unlinked", { id: tid });
      fetchLinkedProjects();
      fetchLead();
    } catch {
      toast.error("Failed", { id: tid });
    }
  };

  const handleAddFollowup = async () => {
    if (!fuForm.discussion_summary.trim()) {
      toast.error("Summary required");
      return;
    }
    setFuSaving(true);
    try {
      await fetch(`/api/leads/${id}/followups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fuForm),
      });
      toast.success("Follow-up added");
      setFuForm({
        followup_date: new Date().toISOString().split("T")[0],
        followup_type: "CALL",
        discussion_summary: "",
        next_action: "",
        next_followup_date: "",
      });
      setFuOpen(false);
      fetchLead();
    } catch {
      toast.error("Failed to save follow-up");
    } finally {
      setFuSaving(false);
    }
  };

  const handleDeleteFollowup = async (fid: string) => {
    const tid = toast.loading("Deleting...");
    try {
      await fetch(`/api/leads/${id}/followups?followup_id=${fid}`, {
        method: "DELETE",
      });
      toast.success("Deleted", { id: tid });
      fetchLead();
    } catch {
      toast.error("Failed", { id: tid });
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

  const isCompleted = linkedProjects.some(
    (p) => p.project_status === "COMPLETED",
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <IconLoader2 className="animate-spin text-muted-foreground" size={32} />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <p className="text-muted-foreground">Lead not found</p>
        <Button variant="outline" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar ── */}
      <div className="border-b px-6 py-3 flex items-center gap-3 shrink-0 bg-background">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground h-8"
          onClick={() => router.push("/leads")}
        >
          <IconArrowLeft size={15} />
          Back
        </Button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium truncate">{lead.client_name}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setEditOpen(true)}
          >
            <IconEdit size={14} />
            Edit
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto px-6 py-8">
          {/* ── Header ── */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
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

            <h1 className="text-3xl font-bold mb-2">{lead.client_name}</h1>

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

            {lead.proposed_quote && (
              <div className="inline-flex items-center gap-2 bg-muted/60 rounded-lg px-4 py-2.5">
                <span className="text-xs text-muted-foreground font-medium">
                  Quote
                </span>
                <span className="text-xl font-bold">
                  ${Number(lead.proposed_quote).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* ── Tabs ── */}
          <div className="flex gap-6 border-b mb-6">
            {tabBtn("overview", "Overview")}
            {tabBtn("followups", "Follow-ups", lead.followups.length)}
            {tabBtn("post-delivery", "Post-Delivery")}
            {tabBtn("timeline", "Timeline", lead.activity_logs.length)}
          </div>

          {/* ════ OVERVIEW ════ */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-3 gap-6">
              {/* Main column */}
              <div className="col-span-2 space-y-6">
                {/* Linked Projects */}
                <section className="border rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
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
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <IconLink size={13} />
                        Link Project
                      </button>
                    )}
                  </div>

                  {linkOpen && canManage && (
                    <div className="mb-4 p-3 border rounded-lg bg-muted/30 space-y-3">
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
                              <div className="absolute z-20 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
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
                                      <p className="font-medium">{p.name}</p>
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
                    <p className="text-sm text-muted-foreground">
                      No project linked yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {linkedProjects.map((lp) => (
                        <div
                          key={lp.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-2 h-2 rounded-full shrink-0 ${lp.project_status === "COMPLETED" ? "bg-green-500" : lp.project_status === "ACTIVE" ? "bg-blue-500" : "bg-muted-foreground"}`}
                            />
                            <div>
                              <p className="text-sm font-medium">
                                {lp.project_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {lp.project_status.replace(/_/g, " ")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <a
                              href={`/projects/${lp.project_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            >
                              <IconExternalLink size={14} />
                            </a>
                            {canManage && (
                              <button
                                onClick={() => handleUnlink(lp.project_id)}
                                className="h-7 w-7 flex items-center justify-center rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"
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

                {/* Contact */}
                <section className="border rounded-xl p-5">
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
                    <IconUser size={15} className="text-muted-foreground" />
                    Contact Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {lead.country && (
                      <PField
                        label="Country"
                        value={lead.country}
                        icon={<IconMapPin size={13} />}
                      />
                    )}
                    <PField
                      label="Added By"
                      value={lead.sent_by_name ?? "Unknown"}
                      icon={<IconUser size={13} />}
                    />
                    {lead.email && (
                      <PField
                        label="Email"
                        value={lead.email}
                        icon={<IconMail size={13} />}
                      />
                    )}
                    {lead.phone && (
                      <PField
                        label="Phone"
                        value={lead.phone}
                        icon={<IconPhone size={13} />}
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
                          {lead.profile_url.length > 60
                            ? lead.profile_url.slice(0, 60) + "..."
                            : lead.profile_url}
                          <IconExternalLink size={13} />
                        </a>
                      </div>
                    )}
                  </div>
                </section>

                {/* Project Details */}
                {(lead.requirements || lead.challenges) && (
                  <section className="border rounded-xl p-5">
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
                      <IconBriefcase
                        size={15}
                        className="text-muted-foreground"
                      />
                      Project Details
                    </h3>
                    <div className="space-y-3">
                      {(lead.service_category || lead.expected_timeline) && (
                        <div className="grid grid-cols-2 gap-4">
                          {lead.service_category && (
                            <PField
                              label="Service Category"
                              value={lead.service_category.replace(/_/g, " ")}
                            />
                          )}
                          {lead.expected_timeline && (
                            <PField
                              label="Expected Timeline"
                              value={lead.expected_timeline}
                              icon={<IconClock size={13} />}
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
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                {/* Financials */}
                {(lead.budget || lead.proposed_quote || lead.deal_value) && (
                  <div className="border rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Financials
                    </h4>
                    {lead.budget && (
                      <PField
                        label="Budget"
                        value={`$${Number(lead.budget).toLocaleString()}`}
                      />
                    )}
                    {lead.proposed_quote && (
                      <PField
                        label="Proposed Quote"
                        value={`$${Number(lead.proposed_quote).toLocaleString()}`}
                      />
                    )}
                    {lead.deal_value && (
                      <PField
                        label="Deal Value"
                        value={`$${Number(lead.deal_value).toLocaleString()}`}
                      />
                    )}
                  </div>
                )}

                {/* Follow-up dates */}
                {(lead.follow_up_date || lead.next_follow_up_date) && (
                  <div className="border rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Follow-up Dates
                    </h4>
                    {lead.follow_up_date && (
                      <PField
                        label="Follow-up"
                        value={format(
                          new Date(lead.follow_up_date),
                          "dd MMM yyyy",
                        )}
                        icon={<IconCalendar size={13} />}
                      />
                    )}
                    {lead.next_follow_up_date && (
                      <PField
                        label="Next Follow-up"
                        value={format(
                          new Date(lead.next_follow_up_date),
                          "dd MMM yyyy",
                        )}
                        icon={<IconCalendar size={13} />}
                      />
                    )}
                  </div>
                )}

                {/* Notes */}
                {lead.notes && (
                  <div className="border rounded-xl p-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Notes
                    </h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {lead.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════ FOLLOW-UPS ════ */}
          {activeTab === "followups" && (
            <div className="space-y-4">
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
                <div className="border rounded-xl p-4 space-y-3 bg-muted/20">
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
                      rows={3}
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
                  <div className="grid grid-cols-2 gap-3">
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
                      {fuSaving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              )}

              {lead.followups.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground border rounded-xl">
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
                      className="border rounded-xl p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                            {fu.followup_type}
                          </span>
                          <span className="text-sm font-medium">
                            {format(new Date(fu.followup_date), "dd MMM yyyy")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {fu.created_by_name}
                          </span>
                          <button
                            onClick={() => handleDeleteFollowup(fu.id)}
                            className="h-6 w-6 flex items-center justify-center rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"
                          >
                            <IconTrash size={13} />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {fu.discussion_summary}
                      </p>
                      {fu.next_action && (
                        <div className="flex items-start gap-1.5 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-100 px-2.5 py-1.5 rounded">
                          <IconCheck
                            size={13}
                            className="text-amber-600 mt-0.5 shrink-0"
                          />
                          <span className="text-amber-800">
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

          {/* ════ POST-DELIVERY ════ */}
          {activeTab === "post-delivery" && (
            <div className="space-y-4">
              <LeadPostDelivery
                leadId={id}
                canLog={canManage || lead?.sent_by === session?.user?.id}
                onUpdated={fetchLead}
              />
              <LeadUpsell
                leadId={id}
                canLog={canManage || lead?.sent_by === session?.user?.id}
                onUpdated={fetchLead}
              />
            </div>
          )}

          {/* ════ TIMELINE ════ */}
          {activeTab === "timeline" && (
            <div className="">
              <h3 className="text-sm font-semibold mb-4">Activity Timeline</h3>
              {lead.activity_logs.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground border rounded-xl">
                  <IconClock size={32} className="mx-auto mb-3 opacity-20" />
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
                      if (log.changes) changedFields = JSON.parse(log.changes);
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
                        <div className="shrink-0 mt-0.5">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${ACTION_COLOR[log.action] ?? "bg-muted-foreground"}`}
                          >
                            {log.action === "CREATED"
                              ? "✓"
                              : log.action === "UPDATED"
                                ? "✎"
                                : log.action === "STATUS_CHANGED"
                                  ? "↔"
                                  : "•"}
                          </div>
                        </div>
                        <div className="flex-1 border rounded-xl overflow-hidden">
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
                                      <span className="text-green-600 font-medium">
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
      </div>

      {/* Edit dialog */}
      <LeadDialog
        open={editOpen}
        onOpenChange={(v) => {
          if (!v) setEditOpen(false);
        }}
        lead={lead}
        onSuccess={() => {
          setEditOpen(false);
          fetchLead();
        }}
      />
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function PField({
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
