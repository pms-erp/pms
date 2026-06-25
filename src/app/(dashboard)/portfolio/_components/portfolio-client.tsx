"use client";
// src/app/(dashboard)/portfolio/_components/portfolio-client.tsx

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  IconPlus,
  IconSearch,
  IconEye,
  IconEdit,
  IconTrash,
  IconGlobe,
  IconFilter,
  IconX,
  IconDots,
  IconCopy,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { PortfolioDialog } from "./portfolio-dialog";
import { PortfolioDetailSheet } from "./portfolio-detail-sheet";
import { PortfolioImportButton } from "./portfolio-import-button";
import {
  SOURCE_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  WEBSITE_BUILDER_OPTIONS,
  STATUS_OPTIONS,
  PortfolioItem,
  PortfolioFilters,
} from "../types";

const STATUS_STYLE: Record<string, string> = {
  DRAFT:
    "bg-amber-50  text-amber-700  border-amber-200  dark:bg-amber-950/30  dark:text-amber-400  dark:border-amber-800",
  PUBLISHED:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
  ARCHIVED:
    "bg-slate-100  text-slate-500  border-slate-200  dark:bg-slate-800     dark:text-slate-400  dark:border-slate-700",
};

// ── Tabs ──────────────────────────────────────────────────────────────────────
type ActiveTab = "all" | "favorites";

const EMPTY_FILTERS: PortfolioFilters = {
  search: "",
  source: "",
  project_type: "",
  website_builder: "",
  status: "",
  is_public: "",
  is_favorite: "",
  date_from: "",
  date_to: "",
};

function labelOf(
  options: readonly { value: string; label: string }[],
  value?: string | null,
) {
  return options.find((o) => o.value === value)?.label ?? value ?? "—";
}

function hasActiveFilters(f: PortfolioFilters) {
  return !!(
    f.source ||
    f.project_type ||
    f.website_builder ||
    f.status ||
    f.is_public ||
    f.date_from ||
    f.date_to
  );
}

function copyToClipboard(text: string, label = "Copied") {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(label))
    .catch(() => toast.error("Copy failed"));
}

// ── URL cell ──────────────────────────────────────────────────────────────────
function UrlCell({ url, label }: { url: string | null; label: string }) {
  if (!url) return <span className="text-muted-foreground/40 text-xs">—</span>;
  const short = url
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/\/$/, "")
    .slice(0, 24);
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-xs text-primary hover:underline truncate min-w-0"
        title={url}
      >
        {short}
      </a>
      <button
        onClick={(e) => {
          e.stopPropagation();
          copyToClipboard(url, `${label} copied`);
        }}
        className="shrink-0 rounded p-0.5 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title={`Copy ${label}`}
      >
        <IconCopy className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── Bulk copy header ──────────────────────────────────────────────────────────
function BulkCopyButton({
  items,
  field,
  label,
}: {
  items: PortfolioItem[];
  field: "website_url" | "figma_url";
  label: string;
}) {
  const urls = items
    .slice(0, 20)
    .map((i) => i[field])
    .filter(Boolean) as string[];
  return (
    <span className="flex items-center gap-1.5">
      {label}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (!urls.length) {
            toast.error("No URLs to copy");
            return;
          }
          copyToClipboard(urls.join("\n"), `${urls.length} ${label}s copied`);
        }}
        title={`Copy first ${Math.min(urls.length, 20)} ${label}s`}
        className="rounded p-0.5 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      >
        <IconCopy className="h-3 w-3" />
      </button>
    </span>
  );
}

// ── Favorite toggle button ────────────────────────────────────────────────────
function FavoriteButton({
  item,
  onToggled,
}: {
  item: PortfolioItem;
  onToggled: (id: string, newValue: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/portfolio/${item.id}/favorite`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: !item.is_favorite }),
      });
      if (!res.ok) throw new Error();
      onToggled(item.id, !item.is_favorite);
      toast.success(
        !item.is_favorite ? "Added to favorites" : "Removed from favorites",
      );
    } catch {
      toast.error("Failed to update favorite");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={item.is_favorite ? "Remove from favorites" : "Add to favorites"}
      className={cn(
        "shrink-0 rounded p-0.5 transition-colors",
        item.is_favorite
          ? "text-amber-400 hover:text-amber-500"
          : "text-muted-foreground/40 hover:text-amber-400",
        loading && "opacity-50 cursor-not-allowed",
      )}
    >
      {item.is_favorite ? (
        <IconStarFilled className="h-3.5 w-3.5" />
      ) : (
        <IconStar className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

// ── Row actions dropdown ──────────────────────────────────────────────────────
function RowActions({
  item,
  onView,
  onEdit,
  onDelete,
  onFavoriteToggled,
}: {
  item: PortfolioItem;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFavoriteToggled: (id: string, newValue: boolean) => void;
}) {
  const [favLoading, setFavLoading] = useState(false);

  const toggleFavorite = async () => {
    if (favLoading) return;
    setFavLoading(true);
    try {
      const res = await fetch(`/api/portfolio/${item.id}/favorite`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: !item.is_favorite }),
      });
      if (!res.ok) throw new Error();
      onFavoriteToggled(item.id, !item.is_favorite);
      toast.success(
        !item.is_favorite ? "Added to favorites" : "Removed from favorites",
      );
    } catch {
      toast.error("Failed to update favorite");
    } finally {
      setFavLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={(e) => e.stopPropagation()}
        >
          <IconDots className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem onClick={onView}>
          <IconEye className="h-3.5 w-3.5 mr-2" /> View Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <IconEdit className="h-3.5 w-3.5 mr-2" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={toggleFavorite} disabled={favLoading}>
          {item.is_favorite ? (
            <>
              <IconStarFilled className="h-3.5 w-3.5 mr-2 text-amber-400" />
              Remove from Favorites
            </>
          ) : (
            <>
              <IconStar className="h-3.5 w-3.5 mr-2" />
              Add to Favorites
            </>
          )}
        </DropdownMenuItem>
        {item.website_url && (
          <DropdownMenuItem
            onClick={() =>
              copyToClipboard(item.website_url!, "Website URL copied")
            }
          >
            <IconCopy className="h-3.5 w-3.5 mr-2" /> Copy Website URL
          </DropdownMenuItem>
        )}
        {item.figma_url && (
          <DropdownMenuItem
            onClick={() => copyToClipboard(item.figma_url!, "Figma URL copied")}
          >
            <IconCopy className="h-3.5 w-3.5 mr-2" /> Copy Figma URL
          </DropdownMenuItem>
        )}
        {item.website_url && (
          <DropdownMenuItem
            onClick={() => window.open(item.website_url!, "_blank")}
          >
            <IconGlobe className="h-3.5 w-3.5 mr-2" /> Open Website
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onDelete}
          className="text-destructive focus:text-destructive"
        >
          <IconTrash className="h-3.5 w-3.5 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function PortfolioClient() {
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<PortfolioFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<PortfolioItem | null>(null);
  const [viewItem, setViewItem] = useState<PortfolioItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const LIMIT = 20;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(LIMIT));
      if (filters.search) params.set("search", filters.search);
      if (filters.source) params.set("source", filters.source);
      if (filters.project_type)
        params.set("project_type", filters.project_type);
      if (filters.website_builder)
        params.set("website_builder", filters.website_builder);
      if (filters.status) params.set("status", filters.status);
      if (filters.is_public) params.set("is_public", filters.is_public);
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to) params.set("date_to", filters.date_to);
      // Favorites tab injects is_favorite=true; the filter dropdown can also do it
      if (activeTab === "favorites") {
        params.set("is_favorite", "true");
      } else if (filters.is_favorite) {
        params.set("is_favorite", filters.is_favorite);
      }
      const res = await fetch(`/api/portfolio?${params}`);
      const json = await res.json();
      const sorted = (json.data ?? []).sort(
        (a: PortfolioItem, b: PortfolioItem) => {
          const da = a.project_date
            ? new Date(a.project_date).getTime()
            : new Date(a.created_at).getTime();
          const db_ = b.project_date
            ? new Date(b.project_date).getTime()
            : new Date(b.created_at).getTime();
          return db_ - da;
        },
      );
      setItems(sorted);
      setTotal(json.total ?? 0);
    } catch {
      toast.error("Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  }, [filters, page, activeTab]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const setFilter = (k: keyof PortfolioFilters) => (v: string) => {
    setFilters((p) => ({ ...p, [k]: v === "all" ? "" : v }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  // Optimistic local update — avoids full refetch on every star click
  const handleFavoriteToggled = (id: string, newValue: boolean) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, is_favorite: newValue } : item,
      ),
    );
    // If we're on the favorites tab and unfavorited, remove from list
    if (activeTab === "favorites" && !newValue) {
      setItems((prev) => prev.filter((item) => item.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    }
  };

  const switchTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setPage(1);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/portfolio/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Entry deleted");
      setDeleteId(null);
      fetchItems();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const handleSheetSaved = () => {
    fetchItems();
    setViewItem(null);
  };

  const totalPages = Math.ceil(total / LIMIT);
  const activeFilters = hasActiveFilters(filters);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading
              ? "Loading…"
              : `${total} project${total !== 1 ? "s" : ""} ${activeTab === "favorites" ? "favorited" : "across all platforms"}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <PortfolioImportButton onImported={fetchItems} />
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <IconPlus className="h-4 w-4" /> New Entry
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b">
        <button
          onClick={() => switchTab("all")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
            activeTab === "all"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          All Projects
        </button>
        <button
          onClick={() => switchTab("favorites")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
            activeTab === "favorites"
              ? "border-amber-400 text-amber-500"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <IconStarFilled
            className={cn(
              "h-3.5 w-3.5",
              activeTab === "favorites" ? "text-amber-400" : "opacity-50",
            )}
          />
          Favorites
        </button>
      </div>

      {/* Search + Filters */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search project, client, business…"
              className="pl-9 h-9"
              value={filters.search}
              onChange={(e) => setFilter("search")(e.target.value)}
            />
            {filters.search && (
              <button
                onClick={() => setFilter("search")("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button
            variant={filtersOpen || activeFilters ? "default" : "outline"}
            size="sm"
            className="gap-1.5 h-9"
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <IconFilter className="h-3.5 w-3.5" />
            Filters
            {activeFilters && (
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
                {
                  [
                    filters.source,
                    filters.project_type,
                    filters.website_builder,
                    filters.status,
                    filters.is_public,
                    filters.date_from,
                    filters.date_to,
                  ].filter(Boolean).length
                }
              </span>
            )}
          </Button>
          {activeFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-muted-foreground gap-1"
              onClick={clearFilters}
            >
              <IconX className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>

        {filtersOpen && (
          <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {[
                {
                  label: "Source",
                  key: "source" as const,
                  opts: SOURCE_OPTIONS,
                },
                {
                  label: "Project Type",
                  key: "project_type" as const,
                  opts: PROJECT_TYPE_OPTIONS,
                },
                {
                  label: "Builder",
                  key: "website_builder" as const,
                  opts: WEBSITE_BUILDER_OPTIONS,
                },
                {
                  label: "Status",
                  key: "status" as const,
                  opts: STATUS_OPTIONS,
                },
              ].map(({ label, key, opts }) => (
                <div key={key} className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                    {label}
                  </p>
                  <Select
                    value={filters[key] || "all"}
                    onValueChange={setFilter(key)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All {label}s</SelectItem>
                      {opts.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                  Visibility
                </p>
                <Select
                  value={filters.is_public || "all"}
                  onValueChange={setFilter("is_public")}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="true">Public</SelectItem>
                    <SelectItem value="false">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                  Date From
                </p>
                <Input
                  type="date"
                  className="h-8 text-xs w-36"
                  value={filters.date_from}
                  onChange={(e) => setFilter("date_from")(e.target.value)}
                />
              </div>
              <span className="text-muted-foreground text-sm pb-1">—</span>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                  Date To
                </p>
                <Input
                  type="date"
                  className="h-8 text-xs w-36"
                  value={filters.date_to}
                  onChange={(e) => setFilter("date_to")(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {activeFilters && (
          <div className="flex flex-wrap gap-1.5">
            {filters.source && (
              <FilterPill
                label={`Source: ${labelOf(SOURCE_OPTIONS, filters.source)}`}
                onRemove={() => setFilter("source")("all")}
              />
            )}
            {filters.project_type && (
              <FilterPill
                label={`Type: ${labelOf(PROJECT_TYPE_OPTIONS, filters.project_type)}`}
                onRemove={() => setFilter("project_type")("all")}
              />
            )}
            {filters.website_builder && (
              <FilterPill
                label={`Builder: ${labelOf(WEBSITE_BUILDER_OPTIONS, filters.website_builder)}`}
                onRemove={() => setFilter("website_builder")("all")}
              />
            )}
            {filters.status && (
              <FilterPill
                label={`Status: ${labelOf(STATUS_OPTIONS, filters.status)}`}
                onRemove={() => setFilter("status")("all")}
              />
            )}
            {filters.is_public && (
              <FilterPill
                label={
                  filters.is_public === "true" ? "Public only" : "Private only"
                }
                onRemove={() => setFilter("is_public")("all")}
              />
            )}
            {filters.date_from && (
              <FilterPill
                label={`From: ${filters.date_from}`}
                onRemove={() => setFilter("date_from")("")}
              />
            )}
            {filters.date_to && (
              <FilterPill
                label={`To: ${filters.date_to}`}
                onRemove={() => setFilter("date_to")("")}
              />
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {/* Favorite star column */}
              <TableHead className="w-[36px]" />
              <TableHead className="w-[88px] text-xs">Date</TableHead>
              <TableHead className="text-xs">Project Name</TableHead>
              <TableHead className="hidden md:table-cell text-xs">
                Customer
              </TableHead>
              <TableHead className="hidden lg:table-cell text-xs">
                Business
              </TableHead>
              <TableHead className="hidden xl:table-cell w-[115px] text-xs">
                Type
              </TableHead>
              <TableHead className="hidden xl:table-cell w-[95px] text-xs">
                Builder
              </TableHead>
              <TableHead className="w-[170px] text-xs">
                <BulkCopyButton
                  items={items}
                  field="website_url"
                  label="Website URL"
                />
              </TableHead>
              <TableHead className="w-[170px] text-xs">
                <BulkCopyButton
                  items={items}
                  field="figma_url"
                  label="Figma URL"
                />
              </TableHead>
              <TableHead className="w-[70px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="text-center py-14 text-muted-foreground text-sm"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-14">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    {activeTab === "favorites" ? (
                      <>
                        <IconStarFilled className="h-8 w-8 opacity-20" />
                        <p className="text-sm font-medium">No favorites yet</p>
                        <p className="text-xs">
                          Click the star on any project to add it here
                        </p>
                      </>
                    ) : (
                      <>
                        <IconGlobe className="h-8 w-8 opacity-20" />
                        <p className="text-sm font-medium">
                          No portfolio entries found
                        </p>
                        {activeFilters && (
                          <button
                            onClick={clearFilters}
                            className="text-xs text-primary hover:underline"
                          >
                            Clear filters
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setViewItem(item)}
                >
                  {/* ── Favorite star ── */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <FavoriteButton
                      item={item}
                      onToggled={handleFavoriteToggled}
                    />
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground">
                    {item.project_date
                      ? new Date(item.project_date).toLocaleDateString(
                          "en-GB",
                          { day: "2-digit", month: "short", year: "2-digit" },
                        )
                      : "—"}
                  </TableCell>

                  <TableCell className="max-w-[120px]">
                    <p
                      className="font-medium text-sm truncate"
                      title={item.project_name}
                    >
                      {item.project_name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge
                        className={cn(
                          "text-[10px] font-medium border px-1 py-0 h-4",
                          STATUS_STYLE[item.status],
                        )}
                      >
                        {item.status}
                      </Badge>
                      {item.project_id && (
                        <span className="text-[11px] text-muted-foreground truncate">
                          {item.project_id}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {item.customer_name ?? "—"}
                  </TableCell>

                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-[130px]">
                    <p className="truncate" title={item.business_name ?? ""}>
                      {item.business_name ?? "—"}
                    </p>
                  </TableCell>

                  <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                    {labelOf(PROJECT_TYPE_OPTIONS, item.project_type)}
                  </TableCell>

                  <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                    {labelOf(WEBSITE_BUILDER_OPTIONS, item.website_builder)}
                  </TableCell>

                  <TableCell className="w-[170px]">
                    <UrlCell url={item.website_url} label="Website URL" />
                  </TableCell>

                  <TableCell className="w-[170px]">
                    <UrlCell url={item.figma_url} label="Figma URL" />
                  </TableCell>

                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1 justify-end">
                      {/* Direct Edit Button */}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditItem(item);
                        }}
                        title="Edit project"
                      >
                        <IconEdit className="h-4 w-4" />
                      </Button>
                      {/* Row Actions Dropdown */}
                      <RowActions
                        item={item}
                        onView={() => setViewItem(item)}
                        onEdit={() => setEditItem(item)}
                        onDelete={() => setDeleteId(item.id)}
                        onFavoriteToggled={handleFavoriteToggled}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination — hidden when searching */}
      {!filters.search && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of{" "}
            {total}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <PortfolioDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={fetchItems}
      />
      <PortfolioDialog
        open={!!editItem}
        onClose={() => setEditItem(null)}
        onSaved={fetchItems}
        item={editItem}
      />
      <PortfolioDetailSheet
        open={!!viewItem}
        onClose={() => setViewItem(null)}
        item={viewItem}
        onSaved={handleSheetSaved}
      />

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Portfolio Entry</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The entry will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FilterPill({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs font-medium">
      {label}
      <button
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground transition-colors ml-0.5"
      >
        <IconX className="h-3 w-3" />
      </button>
    </span>
  );
}
