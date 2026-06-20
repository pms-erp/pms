"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconCreditCard,
  IconBell,
  IconCheck,
  IconAlertTriangle,
  IconMail,
  IconRefresh,
  IconExternalLink,
  IconCircleCheck,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type BillingCategory =
  | "HOSTING"
  | "DOMAIN"
  | "SOFTWARE"
  | "SAAS"
  | "UTILITY"
  | "INTERNET"
  | "PHONE"
  | "MARKETING"
  | "OTHER";

type BillingCycle =
  | "ONE_TIME"
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMI_ANNUAL"
  | "ANNUAL";

type BillingStatus = "ACTIVE" | "PAID" | "OVERDUE" | "CANCELLED" | "PAUSED";

type Bill = {
  id: string;
  service_name: string;
  vendor_name: string | null;
  category: BillingCategory;
  billing_cycle: BillingCycle;
  reference_number: string | null;
  account_number: string | null;
  customer_name: string | null;
  login_url: string | null;
  login_email: string | null;
  amount: string;
  currency: string;
  due_date: string;
  last_paid_date: string | null;
  start_date: string | null;
  reminder_days_before: number | null;
  whatsapp_sent_at: string | null;
  status: BillingStatus;
  notes: string | null;
  created_at: string;
};

type BillFormData = {
  service_name: string;
  vendor_name: string;
  category: BillingCategory;
  billing_cycle: BillingCycle;
  reference_number: string;
  account_number: string;
  customer_name: string;
  login_url: string;
  login_email: string;
  amount: string;
  currency: string;
  due_date: string;
  last_paid_date: string;
  start_date: string;
  reminder_days_before: string;
  status: BillingStatus;
  notes: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<BillingCategory, string> = {
  HOSTING: "Hosting",
  DOMAIN: "Domain",
  SOFTWARE: "Software",
  SAAS: "SaaS",
  UTILITY: "Utility",
  INTERNET: "Internet",
  PHONE: "Phone",
  MARKETING: "Marketing",
  OTHER: "Other",
};

const CYCLE_LABELS: Record<BillingCycle, string> = {
  ONE_TIME: "One-time",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  SEMI_ANNUAL: "Semi-Annual",
  ANNUAL: "Annual",
};

const STATUS_CONFIG: Record<
  BillingStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  ACTIVE: { label: "Active", variant: "default" },
  PAID: { label: "Paid", variant: "secondary" },
  OVERDUE: { label: "Overdue", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
  PAUSED: { label: "Paused", variant: "outline" },
};

const CATEGORY_COLORS: Record<BillingCategory, string> = {
  HOSTING: "bg-blue-100 text-blue-700",
  DOMAIN: "bg-purple-100 text-purple-700",
  SOFTWARE: "bg-green-100 text-green-700",
  SAAS: "bg-cyan-100 text-cyan-700",
  UTILITY: "bg-yellow-100 text-yellow-700",
  INTERNET: "bg-orange-100 text-orange-700",
  PHONE: "bg-pink-100 text-pink-700",
  MARKETING: "bg-red-100 text-red-700",
  OTHER: "bg-gray-100 text-gray-700",
};

const EMPTY_FORM: BillFormData = {
  service_name: "",
  vendor_name: "",
  category: "OTHER",
  billing_cycle: "MONTHLY",
  reference_number: "",
  account_number: "",
  customer_name: "",
  login_url: "",
  login_email: "",
  amount: "",
  currency: "PKR",
  due_date: "",
  last_paid_date: "",
  start_date: "",
  reminder_days_before: "1",
  status: "ACTIVE",
  notes: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDaysUntilDue(dueDate: string): number {
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(amount: string, currency: string): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: currency === "PKR" ? "PKR" : currency === "USD" ? "USD" : "EUR",
    minimumFractionDigits: 0,
  }).format(num);
}

// ── NEW: Check if bill was paid this month ────────────────────────────────────
function isPaidThisMonth(lastPaidDate: string | null): boolean {
  if (!lastPaidDate) return false;
  const paid = new Date(lastPaidDate);
  const now = new Date();
  return (
    paid.getFullYear() === now.getFullYear() &&
    paid.getMonth() === now.getMonth()
  );
}

function getDueBadge(bill: Bill): { text: string; className: string } {
  if (bill.status === "PAID")
    return { text: "Paid", className: "text-green-600" };
  if (bill.status === "CANCELLED")
    return { text: "Cancelled", className: "text-gray-400" };
  // If paid this month, show green due text
  if (isPaidThisMonth(bill.last_paid_date))
    return {
      text: `Next: ${formatDate(bill.due_date)}`,
      className: "text-muted-foreground",
    };
  const days = getDaysUntilDue(bill.due_date);
  if (days < 0)
    return {
      text: `${Math.abs(days)}d overdue`,
      className: "text-red-600 font-semibold",
    };
  if (days === 0)
    return { text: "Due today!", className: "text-red-500 font-semibold" };
  if (days <= 3)
    return {
      text: `Due in ${days}d`,
      className: "text-orange-500 font-medium",
    };
  if (days <= 7)
    return { text: `Due in ${days}d`, className: "text-yellow-600" };
  return {
    text: `Due ${formatDate(bill.due_date)}`,
    className: "text-muted-foreground",
  };
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [formData, setFormData] = useState<BillFormData>(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Bill | null>(null);
  const [markPaidTarget, setMarkPaidTarget] = useState<Bill | null>(null);

  useEffect(() => {
    if (session?.user?.role && session.user.role !== "ADMIN") {
      router.replace("/");
    }
  }, [session, router]);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setBills(data.data ?? []);
    } catch {
      toast.error("Failed to load bills");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  function openCreate() {
    setEditingBill(null);
    setFormData(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(bill: Bill) {
    setEditingBill(bill);
    setFormData({
      service_name: bill.service_name,
      vendor_name: bill.vendor_name ?? "",
      category: bill.category,
      billing_cycle: bill.billing_cycle,
      reference_number: bill.reference_number ?? "",
      account_number: bill.account_number ?? "",
      customer_name: bill.customer_name ?? "",
      login_url: bill.login_url ?? "",
      login_email: bill.login_email ?? "",
      amount: bill.amount,
      currency: bill.currency,
      due_date: bill.due_date,
      last_paid_date: bill.last_paid_date ?? "",
      start_date: bill.start_date ?? "",
      reminder_days_before: String(bill.reminder_days_before ?? 1),
      status: bill.status,
      notes: bill.notes ?? "",
    });
    setDialogOpen(true);
  }

  function setField(key: keyof BillFormData, value: string) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!formData.service_name.trim()) {
      toast.error("Service name is required");
      return;
    }
    if (!formData.amount || isNaN(Number(formData.amount))) {
      toast.error("Valid amount is required");
      return;
    }
    if (!formData.due_date) {
      toast.error("Due date is required");
      return;
    }

    setFormLoading(true);
    try {
      const payload = {
        ...formData,
        amount: formData.amount,
        reminder_days_before: formData.reminder_days_before
          ? parseInt(formData.reminder_days_before)
          : null,
        vendor_name: formData.vendor_name || null,
        reference_number: formData.reference_number || null,
        account_number: formData.account_number || null,
        customer_name: formData.customer_name || null,
        login_url: formData.login_url || null,
        login_email: formData.login_email || null,
        last_paid_date: formData.last_paid_date || null,
        start_date: formData.start_date || null,
        notes: formData.notes || null,
      };

      const url = editingBill
        ? `/api/billing/${editingBill.id}`
        : "/api/billing";
      const method = editingBill ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save");
      }

      toast.success(editingBill ? "Bill updated" : "Bill added");
      setDialogOpen(false);
      fetchBills();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/billing/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Bill deleted");
      setDeleteTarget(null);
      fetchBills();
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handleMarkPaid() {
    if (!markPaidTarget) return;
    try {
      const res = await fetch(`/api/billing/${markPaidTarget.id}/mark-paid`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success("Payment recorded for this month ✅");
      setMarkPaidTarget(null);
      fetchBills();
    } catch {
      toast.error("Failed to update");
    }
  }

  const filtered = bills.filter((b) => {
    const matchStatus = filterStatus === "ALL" || b.status === filterStatus;
    const matchCategory =
      filterCategory === "ALL" || b.category === filterCategory;
    const matchSearch =
      !search ||
      b.service_name.toLowerCase().includes(search.toLowerCase()) ||
      (b.vendor_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (b.customer_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (b.reference_number ?? "").toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchCategory && matchSearch;
  });

  const totalMonthly = bills
    .filter((b) => b.status === "ACTIVE" && b.billing_cycle === "MONTHLY")
    .reduce((sum, b) => sum + parseFloat(b.amount), 0);

  const dueSoon = bills.filter(
    (b) =>
      b.status === "ACTIVE" &&
      !isPaidThisMonth(b.last_paid_date) &&
      getDaysUntilDue(b.due_date) >= 0 &&
      getDaysUntilDue(b.due_date) <= 7,
  ).length;

  const overdue = bills.filter(
    (b) =>
      b.status !== "PAID" &&
      b.status !== "CANCELLED" &&
      !isPaidThisMonth(b.last_paid_date) &&
      getDaysUntilDue(b.due_date) < 0,
  ).length;

  // Count bills paid this month
  const paidThisMonth = bills.filter(
    (b) => b.status === "ACTIVE" && isPaidThisMonth(b.last_paid_date),
  ).length;

  if (!session?.user || session.user.role !== "ADMIN") {
    return null;
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Bills & Subscriptions
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage recurring bills, subscriptions, and payment reminders
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <IconPlus size={16} />
          Add Bill
        </Button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <IconCreditCard size={14} />
            Monthly Recurring
          </div>
          <div className="text-2xl font-bold">
            PKR {totalMonthly.toLocaleString("en-PK")}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <IconCircleCheck size={14} className="text-green-500" />
            Paid This Month
          </div>
          <div
            className={`text-2xl font-bold ${paidThisMonth > 0 ? "text-green-600" : ""}`}
          >
            {paidThisMonth}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <IconBell size={14} />
            Due within 7 days
          </div>
          <div
            className={`text-2xl font-bold ${dueSoon > 0 ? "text-yellow-600" : ""}`}
          >
            {dueSoon}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <IconAlertTriangle size={14} />
            Overdue
          </div>
          <div
            className={`text-2xl font-bold ${overdue > 0 ? "text-red-600" : ""}`}
          >
            {overdue}
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search service, vendor, reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="OVERDUE">Overdue</SelectItem>
            <SelectItem value="PAUSED">Paused</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Categories</SelectItem>
            {(Object.keys(CATEGORY_LABELS) as BillingCategory[]).map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchBills}
          title="Refresh"
        >
          <IconRefresh size={16} />
        </Button>
      </div>

      {/* ── Table ── */}
      <div className="rounded-lg border overflow-hidden px-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Reference / Account</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Cycle</TableHead>
              <TableHead>Due / Status</TableHead>
              <TableHead>Reminder</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-12 text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-12 text-muted-foreground"
                >
                  No bills found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((bill) => {
                const due = getDueBadge(bill);
                const paidMonth = isPaidThisMonth(bill.last_paid_date);
                return (
                  <TableRow
                    key={bill.id}
                    className={paidMonth ? "bg-green-50/40" : ""}
                  >
                    {/* Service */}
                    <TableCell>
                      <div className="font-medium flex items-center gap-1.5">
                        {bill.service_name}
                        {paidMonth && (
                          <IconCircleCheck
                            size={14}
                            className="text-green-500 shrink-0"
                          />
                        )}
                      </div>
                      {bill.vendor_name && (
                        <div className="text-xs text-muted-foreground">
                          {bill.vendor_name}
                        </div>
                      )}
                      {bill.login_url && (
                        <a
                          href={bill.login_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-500 flex items-center gap-0.5 mt-0.5 hover:underline"
                        >
                          <IconExternalLink size={10} /> Login
                        </a>
                      )}
                    </TableCell>

                    {/* Category */}
                    <TableCell>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[bill.category]}`}
                      >
                        {CATEGORY_LABELS[bill.category]}
                      </span>
                    </TableCell>

                    {/* Reference / Account */}
                    <TableCell>
                      <div className="text-sm">
                        {bill.reference_number && (
                          <div className="text-xs">
                            Ref:{" "}
                            <span className="font-mono">
                              {bill.reference_number}
                            </span>
                          </div>
                        )}
                        {bill.account_number && (
                          <div className="text-xs">
                            Acc:{" "}
                            <span className="font-mono">
                              {bill.account_number}
                            </span>
                          </div>
                        )}
                        {bill.login_email && (
                          <div className="text-xs flex items-center gap-1 text-muted-foreground">
                            <IconMail size={10} />
                            {bill.login_email}
                          </div>
                        )}
                        {!bill.reference_number &&
                          !bill.account_number &&
                          !bill.login_email && (
                            <span className="text-muted-foreground">—</span>
                          )}
                      </div>
                    </TableCell>

                    {/* Customer */}
                    <TableCell className="text-sm">
                      {bill.customer_name ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Amount */}
                    <TableCell className="font-medium text-sm tabular-nums">
                      {formatAmount(bill.amount, bill.currency)}
                    </TableCell>

                    {/* Cycle */}
                    <TableCell className="text-sm text-muted-foreground">
                      {CYCLE_LABELS[bill.billing_cycle]}
                    </TableCell>

                    {/* Due / Status */}
                    <TableCell>
                      {/* ── Paid this month banner ── */}
                      {paidMonth && (
                        <div className="flex items-center gap-1 text-xs text-green-600 font-medium mb-1">
                          <IconCircleCheck size={12} />
                          Paid {formatDate(bill.last_paid_date)}
                        </div>
                      )}
                      <div className={`text-xs ${due.className}`}>
                        {due.text}
                      </div>
                      <Badge
                        variant={STATUS_CONFIG[bill.status].variant}
                        className="text-xs mt-1"
                      >
                        {STATUS_CONFIG[bill.status].label}
                      </Badge>
                    </TableCell>

                    {/* Reminder */}
                    <TableCell className="text-xs text-muted-foreground">
                      {bill.reminder_days_before != null ? (
                        <span className="flex items-center gap-1">
                          <IconBell size={11} />
                          {bill.reminder_days_before === 0
                            ? "On due day"
                            : `${bill.reminder_days_before}d before`}
                        </span>
                      ) : (
                        "Disabled"
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {bill.status !== "PAID" &&
                          bill.status !== "CANCELLED" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title={
                                paidMonth
                                  ? "Already paid this month"
                                  : "Mark as Paid this month"
                              }
                              onClick={() =>
                                !paidMonth && setMarkPaidTarget(bill)
                              }
                              className={`h-7 w-7 ${
                                paidMonth
                                  ? "text-green-500 cursor-default opacity-60"
                                  : "text-green-600 hover:text-green-700 hover:bg-green-50"
                              }`}
                            >
                              <IconCheck size={14} />
                            </Button>
                          )}
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit"
                          onClick={() => openEdit(bill)}
                          className="h-7 w-7"
                        >
                          <IconEdit size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete"
                          onClick={() => setDeleteTarget(bill)}
                          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                        >
                          <IconTrash size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Add / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBill ? "Edit Bill" : "Add Bill / Subscription"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 grid gap-1.5">
              <Label>Service Name *</Label>
              <Input
                value={formData.service_name}
                onChange={(e) => setField("service_name", e.target.value)}
                placeholder="e.g. Vercel Pro, Hostinger, ChatGPT Plus"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Vendor / Provider</Label>
              <Input
                value={formData.vendor_name}
                onChange={(e) => setField("vendor_name", e.target.value)}
                placeholder="e.g. Vercel Inc."
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Customer Name (on account)</Label>
              <Input
                value={formData.customer_name}
                onChange={(e) => setField("customer_name", e.target.value)}
                placeholder="Name on the billing account"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Category *</Label>
              <Select
                value={formData.category}
                onValueChange={(v) =>
                  setField("category", v as BillingCategory)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as BillingCategory[]).map(
                    (c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Billing Cycle</Label>
              <Select
                value={formData.billing_cycle}
                onValueChange={(v) =>
                  setField("billing_cycle", v as BillingCycle)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CYCLE_LABELS) as BillingCycle[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CYCLE_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Reference / Invoice Number</Label>
              <Input
                value={formData.reference_number}
                onChange={(e) => setField("reference_number", e.target.value)}
                placeholder="INV-2024-001"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Account Number</Label>
              <Input
                value={formData.account_number}
                onChange={(e) => setField("account_number", e.target.value)}
                placeholder="Customer / subscription ID"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Login URL</Label>
              <Input
                value={formData.login_url}
                onChange={(e) => setField("login_url", e.target.value)}
                placeholder="https://dashboard.example.com"
                type="url"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Login Email</Label>
              <Input
                value={formData.login_email}
                onChange={(e) => setField("login_email", e.target.value)}
                placeholder="account@email.com"
                type="email"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Amount *</Label>
              <Input
                value={formData.amount}
                onChange={(e) => setField("amount", e.target.value)}
                placeholder="0.00"
                type="number"
                step="0.01"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Currency</Label>
              <Select
                value={formData.currency}
                onValueChange={(v) => setField("currency", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PKR">PKR – Pakistani Rupee</SelectItem>
                  <SelectItem value="USD">USD – US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR – Euro</SelectItem>
                  <SelectItem value="GBP">GBP – British Pound</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Next Due Date *</Label>
              <Input
                value={formData.due_date}
                onChange={(e) => setField("due_date", e.target.value)}
                type="date"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Subscription Start Date</Label>
              <Input
                value={formData.start_date}
                onChange={(e) => setField("start_date", e.target.value)}
                type="date"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Last Paid Date</Label>
              <Input
                value={formData.last_paid_date}
                onChange={(e) => setField("last_paid_date", e.target.value)}
                type="date"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Reminder (days before due)</Label>
              <Input
                value={formData.reminder_days_before}
                onChange={(e) =>
                  setField("reminder_days_before", e.target.value)
                }
                type="number"
                min="0"
                max="30"
                placeholder="1 = day before, 0 = on due day"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to disable
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => setField("status", v as BillingStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                  <SelectItem value="OVERDUE">Overdue</SelectItem>
                  <SelectItem value="PAUSED">Paused</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 grid gap-1.5">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder="Any additional notes about this bill…"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={formLoading}>
              {formLoading
                ? "Saving…"
                : editingBill
                  ? "Update Bill"
                  : "Add Bill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong>{deleteTarget?.service_name}</strong>? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Mark Paid Confirm ── */}
      <AlertDialog
        open={!!markPaidTarget}
        onOpenChange={() => setMarkPaidTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Record Payment</AlertDialogTitle>
            <AlertDialogDescription>
              Mark <strong>{markPaidTarget?.service_name}</strong> as paid for
              this month? The bill will remain active for next month — only
              today&apos;s payment is recorded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMarkPaid}>
              Confirm Payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
