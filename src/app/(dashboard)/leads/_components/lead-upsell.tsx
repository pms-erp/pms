"use client";

// src/app/(dashboard)/leads/_components/lead-upsell.tsx

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  IconTrendingUp,
  IconArrowRight,
  IconLoader2,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const SERVICE_CATEGORIES = [
  "WEB",
  "MOBILE_APP",
  "AI_AUTOMATION",
  "ERP",
  "DESIGN",
  "SEO",
  "OTHER",
];

const PLATFORMS = [
  "FIVERR",
  "UPWORK",
  "EMAIL",
  "DRIBBBLE",
  "BEHANCE",
  "LINKEDIN",
  "WEBSITE",
  "REFERRAL",
  "OTHER",
];

type Props = {
  leadId: string;
  canLog: boolean;
  onUpdated?: () => void;
};

const EMPTY_CONVERT_FORM = {
  platform: "OTHER",
  client_name: "",
  username: "",
  email: "",
  phone: "",
  country: "",
  profile_url: "",
  date_received: new Date().toISOString().split("T")[0],
  project_title: "",
  requirements: "",
  service_category: "",
  budget: "",
  estimated_cost: "",
  proposed_quote: "",
  expected_timeline: "",
  notes: "",
};

export function LeadUpsell({ leadId, canLog, onUpdated }: Props) {
  const router = useRouter();

  // Log Upsell Opportunity state
  const [identifyOpen, setIdentifyOpen] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [upsellNotes, setUpsellNotes] = useState("");
  const [upsellCategory, setUpsellCategory] = useState("");
  const [upsellValue, setUpsellValue] = useState("");

  // Convert to New Lead state
  const [convertOpen, setConvertOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [convertForm, setConvertForm] = useState(EMPTY_CONVERT_FORM);

  if (!canLog) return null;

  const handleIdentify = async () => {
    if (!upsellNotes.trim()) {
      toast.error("Upsell notes are required");
      return;
    }
    setIdentifying(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/upsell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: upsellNotes,
          service_category: upsellCategory || null,
          estimated_value: upsellValue ? Number(upsellValue) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      toast.success("Upsell opportunity logged");
      setIdentifyOpen(false);
      setUpsellNotes("");
      setUpsellCategory("");
      setUpsellValue("");
      onUpdated?.();
    } catch (err) {
      toast.error("Failed to log upsell opportunity", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIdentifying(false);
    }
  };

  const openConvertDialog = async () => {
    setConvertOpen(true);
    setPrefillLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/upsell`);
      if (!res.ok) return;
      const data = await res.json();
      const prefill = data.prefill;
      if (prefill) {
        setConvertForm((f) => ({
          ...f,
          platform: prefill.platform || "OTHER",
          client_name: prefill.client_name || "",
          email: prefill.email || "",
          phone: prefill.phone || "",
          country: prefill.country || "",
          profile_url: prefill.profile_url || "",
        }));
      }
    } catch {
      // silent — form stays empty, user fills manually
    } finally {
      setPrefillLoading(false);
    }
  };

  const setField = (key: keyof typeof EMPTY_CONVERT_FORM, value: string) =>
    setConvertForm((f) => ({ ...f, [key]: value }));

  const handleConvert = async () => {
    if (!convertForm.client_name.trim()) {
      toast.error("Client name is required");
      return;
    }
    if (!convertForm.date_received) {
      toast.error("Date received is required");
      return;
    }

    setConverting(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/upsell/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...convertForm,
          budget: convertForm.budget ? Number(convertForm.budget) : null,
          estimated_cost: convertForm.estimated_cost
            ? Number(convertForm.estimated_cost)
            : null,
          proposed_quote: convertForm.proposed_quote
            ? Number(convertForm.proposed_quote)
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to convert");

      toast.success("New lead created from upsell");
      setConvertOpen(false);
      setConvertForm(EMPTY_CONVERT_FORM);
      onUpdated?.();

      // Navigate to the new lead
      if (data.newLeadId) {
        router.push(`/leads/${data.newLeadId}`);
      } else {
        router.push("/leads");
      }
    } catch (err) {
      toast.error("Failed to convert upsell", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setConverting(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <IconTrendingUp size={16} className="text-primary" />
          Upsell
        </h3>

        <Separator />

        <div className="flex flex-wrap gap-2">
          {!identifyOpen && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIdentifyOpen(true)}
            >
              <IconTrendingUp size={14} className="mr-1.5" />
              Log Upsell Opportunity
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={openConvertDialog}>
            <IconArrowRight size={14} className="mr-1.5" />
            Convert to New Lead
          </Button>
        </div>

        {/* Log Upsell Opportunity form */}
        {identifyOpen && (
          <div className="border border-primary/30 bg-primary/5 rounded-lg p-3 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Upsell Notes *</Label>
              <Textarea
                value={upsellNotes}
                onChange={(e) => setUpsellNotes(e.target.value)}
                rows={3}
                placeholder="What additional work / service did the client express interest in…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Service Category</Label>
                <Select
                  value={upsellCategory || "none"}
                  onValueChange={(v) =>
                    setUpsellCategory(v === "none" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {SERVICE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Estimated Value ($)</Label>
                <Input
                  type="number"
                  value={upsellValue}
                  onChange={(e) => setUpsellValue(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIdentifyOpen(false);
                  setUpsellNotes("");
                  setUpsellCategory("");
                  setUpsellValue("");
                }}
                disabled={identifying}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleIdentify} disabled={identifying}>
                {identifying ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}

        {/* Convert to New Lead dialog */}
        <Dialog
          open={convertOpen}
          onOpenChange={(v) => {
            if (!v) {
              setConvertOpen(false);
              setConvertForm(EMPTY_CONVERT_FORM);
            }
          }}
        >
          <DialogContent className="max-w-[40vw] min-w-[40vw] max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
              <DialogTitle>Convert Upsell to New Lead</DialogTitle>
            </DialogHeader>

            {prefillLoading ? (
              <div className="flex items-center justify-center py-16">
                <IconLoader2
                  size={24}
                  className="animate-spin text-muted-foreground"
                />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Contact info */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                    Contact Info (pre-filled from original lead)
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Platform *</Label>
                      <Select
                        value={convertForm.platform}
                        onValueChange={(v) => setField("platform", v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PLATFORMS.map((p) => (
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
                        value={convertForm.date_received}
                        onChange={(e) =>
                          setField("date_received", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Client Name *</Label>
                      <Input
                        value={convertForm.client_name}
                        onChange={(e) =>
                          setField("client_name", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Username / Handle</Label>
                      <Input
                        value={convertForm.username}
                        onChange={(e) => setField("username", e.target.value)}
                        placeholder="@username"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={convertForm.email}
                        onChange={(e) => setField("email", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Phone / WhatsApp</Label>
                      <Input
                        value={convertForm.phone}
                        onChange={(e) => setField("phone", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Country</Label>
                      <Input
                        value={convertForm.country}
                        onChange={(e) => setField("country", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Profile URL</Label>
                      <Input
                        value={convertForm.profile_url}
                        onChange={(e) =>
                          setField("profile_url", e.target.value)
                        }
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* New project details */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                    New Project Details
                  </p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Project Title</Label>
                        <Input
                          value={convertForm.project_title}
                          onChange={(e) =>
                            setField("project_title", e.target.value)
                          }
                          placeholder="e.g. SEO Package Q3"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Service Category</Label>
                        <Select
                          value={convertForm.service_category || "none"}
                          onValueChange={(v) =>
                            setField("service_category", v === "none" ? "" : v)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {SERVICE_CATEGORIES.map((c) => (
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
                        value={convertForm.requirements}
                        onChange={(e) =>
                          setField("requirements", e.target.value)
                        }
                        rows={3}
                        placeholder="What does the client want for this upsell…"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <Label>Budget ($)</Label>
                        <Input
                          type="number"
                          value={convertForm.budget}
                          onChange={(e) => setField("budget", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Estimated Cost ($)</Label>
                        <Input
                          type="number"
                          value={convertForm.estimated_cost}
                          onChange={(e) =>
                            setField("estimated_cost", e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Proposed Quote ($)</Label>
                        <Input
                          type="number"
                          value={convertForm.proposed_quote}
                          onChange={(e) =>
                            setField("proposed_quote", e.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Expected Timeline</Label>
                      <Input
                        value={convertForm.expected_timeline}
                        onChange={(e) =>
                          setField("expected_timeline", e.target.value)
                        }
                        placeholder="e.g. 2 weeks, 1 month"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Notes</Label>
                      <Textarea
                        value={convertForm.notes}
                        onChange={(e) => setField("notes", e.target.value)}
                        rows={2}
                        placeholder="Any additional notes…"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="px-6 py-4 border-t shrink-0">
              <Button
                variant="outline"
                onClick={() => {
                  setConvertOpen(false);
                  setConvertForm(EMPTY_CONVERT_FORM);
                }}
                disabled={converting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConvert}
                disabled={converting || prefillLoading}
              >
                {converting ? (
                  <>
                    <IconLoader2 size={14} className="mr-1.5 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create New Lead"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
