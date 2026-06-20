"use client";

// src/app/(dashboard)/leads/page.tsx

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  IconPlus,
  IconSearch,
  IconMail,
  IconBrandLinkedin,
  IconChevronDown,
  IconEye,
  IconEdit,
  IconTrash,
  IconRefresh,
  IconLoader2,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LeadDialog } from "./_components/lead-dialog";
import { LeadDetailSheet } from "./_components/lead-detail-sheet";
import { format } from "date-fns";
import { toast } from "sonner";
import type { LeadDetail } from "./_components/lead-detail-sheet";

// ─── Types ───────────────────────────────────────────────────────────────────

export type LeadRow = {
  id: string;
  platform: string;
  client_name: string;
  username: string | null;
  country: string | null;
  project_title: string | null;
  service_category: string | null;
  status: string;
  priority: string;
  budget: string | null;
  proposed_quote: string | null;
  deal_value: string | null;
  date_received: string;
  follow_up_date: string | null;
  next_follow_up_date: string | null;
  sent_by: string;
  sent_by_name: string | null;
  total_followups: number;
};

type MarketingUser = {
  id: string;
  name: string;
  avatar: string | null;
  role: string;
  team_type: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_OPTIONS = [
  { value: "all", label: "All Platforms" },
  { value: "FIVERR", label: "Fiverr" },
  { value: "UPWORK", label: "Upwork" },
  { value: "EMAIL", label: "Email" },
  { value: "DRIBBBLE", label: "Dribbble" },
  { value: "BEHANCE", label: "Behance" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "WEBSITE", label: "Website" },
  { value: "REFERRAL", label: "Referral" },
  { value: "OTHER", label: "Other" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "PROPOSAL_SENT", label: "Proposal Sent" },
  { value: "NEGOTIATION", label: "Negotiation" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
  { value: "ON_HOLD", label: "On Hold" },
];

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

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  FIVERR: <span className="text-[10px] font-bold text-green-600">FVR</span>,
  UPWORK: <span className="text-[10px] font-bold text-green-500">UPW</span>,
  EMAIL: <IconMail size={12} className="text-blue-500" />,
  DRIBBBLE: <span className="text-[10px] font-bold text-pink-500">DRB</span>,
  BEHANCE: <span className="text-[10px] font-bold text-blue-600">BHN</span>,
  LINKEDIN: <IconBrandLinkedin size={12} className="text-blue-700" />,
  WEBSITE: <span className="text-[10px] font-bold text-purple-500">WEB</span>,
  REFERRAL: <span className="text-[10px] font-bold text-teal-500">REF</span>,
  OTHER: <span className="text-[10px] font-bold text-gray-500">OTH</span>,
};

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ─── Pipeline Stats ────────────────────────────────────────────────────────────

function PipelineStats({ leads }: { leads: LeadRow[] }) {
  const counts = leads.reduce(
    (acc, l) => {
      acc[l.status] = (acc[l.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const pipeline = [
    { key: "NEW", label: "New" },
    { key: "CONTACTED", label: "Contacted" },
    { key: "QUALIFIED", label: "Qualified" },
    { key: "PROPOSAL_SENT", label: "Proposal" },
    { key: "NEGOTIATION", label: "Negotiating" },
    { key: "WON", label: "Won" },
    { key: "LOST", label: "Lost" },
  ];
  return (
    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-4">
      {pipeline.map((p) => (
        <div key={p.key} className="rounded-lg border bg-card p-3 text-center">
          <div className="text-2xl font-bold">{counts[p.key] ?? 0}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{p.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { data: session } = useSession();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("all");
  const [sentByFilter, setSentByFilter] = useState("all");
  const [page, setPage] = useState(1);

  // Marketing users for the filter dropdown
  const [marketingUsers, setMarketingUsers] = useState<MarketingUser[]>([]);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [detailId, setDetailId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // editLead holds the FULL lead detail (not just LeadRow) so all fields populate
  const [editLead, setEditLead] = useState<LeadDetail | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const limit = 20;
  const role = session?.user?.role;
  const canManage = role === "ADMIN" || role === "PROJECT_MANAGER";
  const canDeleteLead = (lead: LeadRow) =>
    canManage || lead.sent_by === session?.user?.id;
  // Fetch marketing users for the dropdown (only once)
  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/leads/marketing-users")
      .then((r) => r.json())
      .then((data) => setMarketingUsers(data.users ?? []))
      .catch(() => {});
  }, [session]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search) params.set("search", search);
      if (platform !== "all") params.set("platform", platform);
      if (status !== "all") params.set("status", status);
      if (sentByFilter !== "all") params.set("sent_by", sentByFilter);
      const res = await fetch(`/api/leads?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLeads(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      toast.error("Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [search, platform, status, sentByFilter, page]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);
  useEffect(() => {
    setPage(1);
  }, [search, platform, status, sentByFilter]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openDetail(id: string) {
    setDetailId(id);
  }

  function openCreate() {
    setEditLead(null);
    setDialogOpen(true);
  }

  // Fetch the full lead detail before opening the edit dialog so all fields
  // (email, phone, requirements, platform_data, etc.) are populated correctly.
  async function openEdit(leadId: string) {
    setLoadingEdit(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`);
      if (!res.ok) throw new Error();
      const data: LeadDetail = await res.json();
      setEditLead(data);
      setDialogOpen(true);
    } catch {
      toast.error("Failed to load lead for editing");
    } finally {
      setLoadingEdit(false);
    }
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditLead(null);
  }

  function handleDelete(id: string) {
    setDeleteTargetId(id);
  }

  async function confirmDelete() {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setDeleteTargetId(null);
    const tid = toast.loading("Deleting lead...");
    try {
      const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Lead deleted", { id: tid });
      fetchLeads();
    } catch {
      toast.error("Failed to delete lead", { id: tid });
    }
  }

  async function handleStatusChange(id: string, newStatus: string) {
    const tid = toast.loading("Updating status...");
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      toast.success("Status updated", { id: tid });
      fetchLeads();
    } catch {
      toast.error("Failed to update status", { id: tid });
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage all your leads across platforms
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchLeads}>
            <IconRefresh size={16} />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <IconPlus size={16} className="mr-1" />
            Add Lead
          </Button>
        </div>
      </div>

      <PipelineStats leads={leads} />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <IconSearch
            size={16}
            className="absolute left-2.5 top-2.5 text-muted-foreground"
          />
          <Input
            placeholder="Search by client, project, username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            {PLATFORM_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* ── Marketing user filter dropdown ─────────────────────────── */}
        {marketingUsers.length > 1 && (
          <Select value={sentByFilter} onValueChange={setSentByFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Members" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Members</SelectItem>
              {marketingUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={u.avatar ?? undefined} />
                      <AvatarFallback className="text-[8px]">
                        {initials(u.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span>{u.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Client</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Requirements</TableHead>
              <TableHead>Quote</TableHead>
              <TableHead>Date Contacted</TableHead>
              <TableHead>Follow-up</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-muted animate-pulse rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-10 text-muted-foreground"
                >
                  No leads found. Add your first lead!
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow
                  key={lead.id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={() => openDetail(lead.id)}
                >
                  {/* Client + Username */}
                  <TableCell>
                    <div className="font-medium text-sm">
                      {lead.client_name}
                    </div>
                    {lead.username && (
                      <div className="text-xs text-muted-foreground">
                        @{lead.username}
                      </div>
                    )}
                  </TableCell>

                  {/* Location */}
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.country ?? "—"}
                  </TableCell>

                  {/* Requirements (Project Title + Category) */}
                  <TableCell>
                    <div className="text-sm max-w-[220px] truncate">
                      {lead.project_title ?? "—"}
                    </div>
                    {lead.service_category && (
                      <div className="text-xs text-muted-foreground">
                        {lead.service_category.replace(/_/g, " ")}
                      </div>
                    )}
                  </TableCell>

                  {/* Quote */}
                  <TableCell className="text-sm font-medium">
                    {lead.proposed_quote
                      ? `$${Number(lead.proposed_quote).toLocaleString()}`
                      : lead.budget
                        ? `$${Number(lead.budget).toLocaleString()}`
                        : "—"}
                  </TableCell>

                  {/* Date Contacted */}
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(lead.date_received), "dd MMM yy")}
                  </TableCell>

                  {/* Follow-up */}
                  <TableCell className="text-xs text-muted-foreground">
                    {lead.next_follow_up_date ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        {format(
                          new Date(lead.next_follow_up_date),
                          "dd MMM yy",
                        )}
                      </span>
                    ) : lead.follow_up_date ? (
                      format(new Date(lead.follow_up_date), "dd MMM yy")
                    ) : (
                      "—"
                    )}
                  </TableCell>

                  {/* Status */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full cursor-pointer ${STATUS_COLORS[lead.status]}`}
                        >
                          {lead.status.replace(/_/g, " ")}
                          <IconChevronDown size={10} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {STATUS_OPTIONS.filter((o) => o.value !== "all").map(
                          (o) => (
                            <DropdownMenuItem
                              key={o.value}
                              onClick={() =>
                                handleStatusChange(lead.id, o.value)
                              }
                            >
                              {o.label}
                            </DropdownMenuItem>
                          ),
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>

                  {/* Actions */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(lead.id);
                        }}
                      >
                        <IconEye size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={loadingEdit}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(lead.id);
                        }}
                      >
                        {loadingEdit ? (
                          <IconLoader2 size={14} className="animate-spin" />
                        ) : (
                          <IconEdit size={14} />
                        )}
                      </Button>
                      {canDeleteLead(lead) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(lead.id);
                          }}
                        >
                          <IconTrash size={14} />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}{" "}
            leads
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* ── Dialogs / Sheets ── */}
      <LeadDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          if (!v) closeDialog();
        }}
        lead={editLead ?? undefined}
        onSuccess={() => {
          closeDialog();
          fetchLeads();
        }}
      />

      <LeadDetailSheet
        open={detailId !== null}
        leadId={detailId ?? ""}
        onClose={() => setDetailId(null)}
        onEdit={(leadId) => {
          setDetailId(null);
          openEdit(leadId);
        }}
        onRefresh={fetchLeads}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteTargetId !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteTargetId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The lead and all its follow-ups will
              be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
