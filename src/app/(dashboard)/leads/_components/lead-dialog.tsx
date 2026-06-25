"use client";

// src/components/leads/lead-dialog.tsx

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import type { LeadRow } from "@/app/(dashboard)/leads/page";
import type { LeadDetail } from "@/app/(dashboard)/leads/_components/lead-detail-sheet";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: LeadDetail; // Changed from LeadRow to LeadDetail
  onSuccess: () => void;
};

// ─── Platform-specific field configs ─────────────────────────────────────────

const PLATFORM_FIELDS: Record<
  string,
  { key: string; label: string; type?: string }[]
> = {
  FIVERR: [
    { key: "buyer_level", label: "Buyer Level" },
    { key: "inquiry_type", label: "Inquiry Type (Inbox / Brief)" },
    { key: "gig_related", label: "Gig Related" },
    { key: "delivery_time_requested", label: "Delivery Time Requested" },
    { key: "fiverr_order_url", label: "Fiverr Order URL" },
  ],
  UPWORK: [
    { key: "job_post_url", label: "Job Post URL" },
    { key: "client_rating", label: "Client Rating" },
    { key: "client_spend", label: "Client Spend ($)" },
    { key: "hire_rate", label: "Hire Rate (%)" },
    { key: "connects_used", label: "Connects Used", type: "number" },
    { key: "proposal_sent_date", label: "Proposal Sent Date", type: "date" },
    { key: "interview_date", label: "Interview Date", type: "date" },
  ],
  EMAIL: [
    { key: "subject", label: "Email Subject" },
    { key: "email_thread_link", label: "Email Thread Link" },
    { key: "referred_by", label: "Referred By" },
  ],
  DRIBBBLE: [
    { key: "portfolio_url", label: "Portfolio URL" },
    { key: "inquiry_source", label: "Inquiry Source" },
    { key: "project_type", label: "Project Type" },
  ],
  BEHANCE: [
    { key: "behance_profile_url", label: "Behance Profile URL" },
    { key: "project_link", label: "Project Link" },
    { key: "design_category", label: "Design Category" },
  ],
  LINKEDIN: [
    { key: "linkedin_profile_url", label: "LinkedIn Profile URL" },
    { key: "company", label: "Company" },
    { key: "position", label: "Position" },
    { key: "connection_status", label: "Connection Status" },
    { key: "message_sent_date", label: "Message Sent Date", type: "date" },
  ],
};

const EMPTY_FORM = {
  platform: "FIVERR",
  client_name: "",
  username: "",
  email: "",
  phone: "",
  country: "",
  profile_url: "",
  date_received: new Date().toISOString().split("T")[0],
  project_title: "",
  requirements: "",
  challenges: "",
  budget: "",
  estimated_cost: "",
  proposed_quote: "",
  expected_timeline: "",
  service_category: "",
  status: "NEW",
  priority: "MEDIUM",
  follow_up_date: "",
  next_follow_up_date: "",
  notes: "",
};

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
      {children}
    </p>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LeadDialog({ open, onOpenChange, lead, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [platformData, setPlatformData] = useState<Record<string, string>>({});

  // Populate on edit / reset on create
  // Populate on edit / reset on create
  useEffect(() => {
    if (!open) return;
    if (lead) {
      setForm({
        platform: lead.platform,
        client_name: lead.client_name,
        username: lead.username ?? "",
        email: lead.email ?? "",
        phone: lead.phone ?? "",
        country: lead.country ?? "",
        profile_url: lead.profile_url ?? "",
        date_received: lead.date_received,
        project_title: lead.project_title ?? "",
        requirements: lead.requirements ?? "",
        challenges: lead.challenges ?? "",
        budget: lead.budget ?? "",
        estimated_cost: lead.estimated_cost ?? "",
        proposed_quote: lead.proposed_quote ?? "",
        expected_timeline: lead.expected_timeline ?? "",
        service_category: lead.service_category ?? "",
        status: lead.status,
        priority: lead.priority,
        follow_up_date: lead.follow_up_date ?? "",
        next_follow_up_date: lead.next_follow_up_date ?? "",
        notes: lead.notes ?? "",
      });
      // Load platform_data if it exists
      if (lead.platform_data) {
        setPlatformData(lead.platform_data);
      } else {
        setPlatformData({});
      }
    } else {
      setForm({
        ...EMPTY_FORM,
        date_received: new Date().toISOString().split("T")[0],
      });
      setPlatformData({});
    }
  }, [lead, open]);

  const set = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    if (!form.client_name.trim()) {
      toast.error("Client name required");
      return;
    }
    if (!form.date_received) {
      toast.error("Date received required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        budget: form.budget ? Number(form.budget) : null,
        estimated_cost: form.estimated_cost
          ? Number(form.estimated_cost)
          : null,
        proposed_quote: form.proposed_quote
          ? Number(form.proposed_quote)
          : null,
        platform_data:
          Object.keys(platformData).length > 0 ? platformData : null,
      };

      const url = lead ? `/api/leads/${lead.id}` : "/api/leads";
      const method = lead ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Save failed");
      toast.success(lead ? "Lead updated" : "Lead created");
      onSuccess();
    } catch {
      toast.error("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const platformFields = PLATFORM_FIELDS[form.platform] ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[40vw] min-w-[40vw] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>{lead ? "Edit Lead" : "New Lead"}</DialogTitle>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* ── Basic Info ─────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Basic Info</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Platform *</Label>
                <Select
                  value={form.platform}
                  onValueChange={(v) => {
                    set("platform", v);
                    setPlatformData({});
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "FIVERR",
                      "UPWORK",
                      "EMAIL",
                      "DRIBBBLE",
                      "BEHANCE",
                      "LINKEDIN",
                      "WEBSITE",
                      "REFERRAL",
                      "OTHER",
                    ].map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date Received *</Label>
                <Input
                  type="date"
                  value={form.date_received}
                  onChange={(e) => set("date_received", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Client Name *</Label>
                <Input
                  value={form.client_name}
                  onChange={(e) => set("client_name", e.target.value)}
                  placeholder="Client Name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Username / Handle</Label>
                <Input
                  value={form.username}
                  onChange={(e) => set("username", e.target.value)}
                  placeholder="@username"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone / WhatsApp</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Country / Location</Label>
                <Input
                  value={form.country}
                  onChange={(e) => set("country", e.target.value)}
                  placeholder="e.g. United States"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Profile URL</Label>
                <Input
                  value={form.profile_url}
                  onChange={(e) => set("profile_url", e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Project Info ───────────────────────────────────────────── */}
          <div>
            <SectionLabel>Project Details</SectionLabel>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Project Title</Label>
                  <Input
                    value={form.project_title}
                    onChange={(e) => set("project_title", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Service Category</Label>
                  <Select
                    value={form.service_category || "none"}
                    onValueChange={(v) =>
                      set("service_category", v === "none" ? "" : v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {[
                        "WEB",
                        "MOBILE_APP",
                        "AI_AUTOMATION",
                        "ERP",
                        "DESIGN",
                        "SEO",
                        "OTHER",
                      ].map((c) => (
                        <SelectItem key={c} value={c}>
                          {c.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Requirements</Label>
                <Textarea
                  value={form.requirements}
                  onChange={(e) => set("requirements", e.target.value)}
                  rows={3}
                  placeholder="What does the client want..."
                />
              </div>

              <div className="space-y-1.5">
                <Label>Challenges / Pain Points</Label>
                <Textarea
                  value={form.challenges}
                  onChange={(e) => set("challenges", e.target.value)}
                  rows={2}
                  placeholder="What are the problems..."
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Budget ($)</Label>
                  <Input
                    type="number"
                    value={form.budget}
                    onChange={(e) => set("budget", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Estimated Cost ($)</Label>
                  <Input
                    type="number"
                    value={form.estimated_cost}
                    onChange={(e) => set("estimated_cost", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Proposed Quote ($)</Label>
                  <Input
                    type="number"
                    value={form.proposed_quote}
                    onChange={(e) => set("proposed_quote", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Expected Timeline</Label>
                <Input
                  value={form.expected_timeline}
                  onChange={(e) => set("expected_timeline", e.target.value)}
                  placeholder="e.g. 2 weeks, 1 month"
                />
              </div>
            </div>
          </div>

          {/* ── Platform-specific ─────────────────────────────────────── */}
          {platformFields.length > 0 && (
            <>
              <Separator />
              <div>
                <SectionLabel>{form.platform} Details</SectionLabel>
                <div className="grid grid-cols-2 gap-4">
                  {platformFields.map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <Label>{field.label}</Label>
                      <Input
                        type={field.type ?? "text"}
                        value={platformData[field.key] ?? ""}
                        onChange={(e) =>
                          setPlatformData((d) => ({
                            ...d,
                            [field.key]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* ── Management ────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Management</SectionLabel>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => set("status", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "NEW",
                        "CONTACTED",
                        "QUALIFIED",
                        "PROPOSAL_SENT",
                        "NEGOTIATION",
                        "WON",
                        "LOST",
                        "ON_HOLD",
                      ].map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select
                    value={form.priority}
                    onValueChange={(v) => set("priority", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["LOW", "MEDIUM", "HIGH"].map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Follow-up Date</Label>
                  <Input
                    type="date"
                    value={form.follow_up_date}
                    onChange={(e) => set("follow_up_date", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Next Follow-up Date</Label>
                  <Input
                    type="date"
                    value={form.next_follow_up_date}
                    onChange={(e) => set("next_follow_up_date", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Notes / Remarks</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={3}
                  placeholder="Any notes or remarks..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : lead ? "Update Lead" : "Save Lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
