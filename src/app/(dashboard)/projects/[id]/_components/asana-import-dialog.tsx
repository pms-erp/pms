// app/(dashboard)/projects/_components/asana-import-dialog.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  IconBrandAsana,
  IconLoader,
  IconCheck,
  IconChevronRight,
  IconAlertTriangle,
  IconRefresh,
} from "@tabler/icons-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AsanaWorkspace {
  gid: string;
  name: string;
}
interface AsanaProject {
  gid: string;
  name: string;
  notes?: string;
  archived?: boolean;
}

type Step = "token" | "workspace" | "projects" | "importing" | "done";

const TEAM_TYPES = [
  { value: "DEVELOPER", label: "Developer" },
  { value: "DESIGNER", label: "Designer" },
  { value: "PROGRAMMER", label: "Programmer" },
];

// ─── Component ────────────────────────────────────────────────────────────────
export function AsanaImportDialog() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("token");

  // form state
  const [token, setToken] = useState("");
  const [workspaces, setWorkspaces] = useState<AsanaWorkspace[]>([]);
  const [selectedWs, setSelectedWs] = useState("");
  const [asanaProjects, setAsanaProjects] = useState<AsanaProject[]>([]);
  const [selectedGids, setSelectedGids] = useState<Set<string>>(new Set());
  const [teamType, setTeamType] = useState("DEVELOPER");

  // loading / result
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    projects_imported: number;
    tasks_imported: number;
    notes_imported: number;
    files_imported: number;
    errors: string[];
  } | null>(null);

  const reset = () => {
    setStep("token");
    setToken("");
    setWorkspaces([]);
    setSelectedWs("");
    setAsanaProjects([]);
    setSelectedGids(new Set());
    setTeamType("DEVELOPER");
    setResult(null);
    setLoading(false);
  };

  // ── Step 1: validate token + fetch workspaces ─────────────────────────────
  const handleFetchWorkspaces = async () => {
    if (!token.trim()) {
      toast.error("Enter your Asana personal access token");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/asana/workspaces?token=${encodeURIComponent(token.trim())}`,
      );
      const data = (await res.json()) as {
        workspaces?: AsanaWorkspace[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setWorkspaces(data.workspaces ?? []);
      if ((data.workspaces ?? []).length === 1)
        setSelectedWs(data.workspaces![0].gid);
      setStep("workspace");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Invalid token or network error",
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: fetch projects in selected workspace ──────────────────────────
  const handleFetchProjects = async () => {
    if (!selectedWs) {
      toast.error("Select a workspace");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/asana/projects?token=${encodeURIComponent(token)}&workspace=${selectedWs}`,
      );
      const data = (await res.json()) as {
        projects?: AsanaProject[];
        total?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const active = (data.projects ?? []).filter((p) => !p.archived);
      setAsanaProjects(active);
      setSelectedGids(new Set(active.map((p) => p.gid))); // select all by default
      setStep("projects");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to fetch projects",
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: run import ─────────────────────────────────────────────────────
  const handleImport = async () => {
    if (selectedGids.size === 0) {
      toast.error("Select at least one project");
      return;
    }
    setStep("importing");
    setLoading(true);
    try {
      const res = await fetch("/api/asana/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          projectGids: Array.from(selectedGids),
          teamType,
        }),
      });
      const data = (await res.json()) as {
        projects_imported: number;
        tasks_imported: number;
        notes_imported: number;
        files_imported: number;
        errors: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setResult({
        projects_imported: data.projects_imported ?? 0,
        tasks_imported: data.tasks_imported ?? 0,
        notes_imported: data.notes_imported ?? 0,
        files_imported: data.files_imported ?? 0,
        errors: data.errors ?? [],
      });
      setStep("done");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
      setStep("projects");
    } finally {
      setLoading(false);
    }
  };

  const toggleProject = (gid: string) => {
    setSelectedGids((prev) => {
      const next = new Set(prev);
      next.has(gid) ? next.delete(gid) : next.add(gid);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedGids((prev) =>
      prev.size === asanaProjects.length
        ? new Set()
        : new Set(asanaProjects.map((p) => p.gid)),
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <IconBrandAsana className="h-4 w-4 text-[#F06A6A]" />
          Import from Asana
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconBrandAsana className="h-5 w-5 text-[#F06A6A]" />
            Import from Asana
          </DialogTitle>
          <DialogDescription>
            {step === "token" &&
              "Enter your Asana Personal Access Token to get started."}
            {step === "workspace" &&
              "Select the Asana workspace to import from."}
            {step === "projects" && "Choose which projects to import."}
            {step === "importing" && "Importing your projects and tasks…"}
            {step === "done" && "Import complete!"}
          </DialogDescription>
        </DialogHeader>

        {/* ── Step indicator ── */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {(["token", "workspace", "projects", "done"] as const).map(
            (s, i, arr) => (
              <span key={s} className="flex items-center gap-1">
                <span
                  className={
                    step === s ||
                    (step === "importing" && s === "projects") ||
                    (step === "done" && s === "done")
                      ? "text-primary font-semibold"
                      : ""
                  }
                >
                  {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
                </span>
                {i < arr.length - 1 && <IconChevronRight className="h-3 w-3" />}
              </span>
            ),
          )}
        </div>

        <div className="py-2 space-y-4">
          {/* ── STEP: Token ── */}
          {step === "token" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Personal Access Token</Label>
                <Input
                  type="password"
                  placeholder="1/xxxxxxxxxxxxxxxx..."
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleFetchWorkspaces()
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Get your token from{" "}
                <a
                  href="https://app.asana.com/0/my-apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  app.asana.com/0/my-apps
                </a>{" "}
                → Create new token.
              </p>
            </div>
          )}

          {/* ── STEP: Workspace ── */}
          {step === "workspace" && (
            <div className="space-y-2">
              <Label>Select Workspace</Label>
              <Select value={selectedWs} onValueChange={setSelectedWs}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a workspace" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((w) => (
                    <SelectItem key={w.gid} value={w.gid}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── STEP: Projects ── */}
          {step === "projects" && (
            <div className="space-y-3">
              {/* Team type selector */}
              <div className="space-y-1.5">
                <Label>Assign tasks to team</Label>
                <Select value={teamType} onValueChange={setTeamType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  All imported tasks will be assigned this team type. You can
                  edit individual tasks after import.
                </p>
              </div>

              {/* Project list */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>
                    Projects{" "}
                    <span className="text-muted-foreground font-normal">
                      ({asanaProjects.length} total)
                    </span>
                  </Label>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs text-primary hover:underline"
                  >
                    {selectedGids.size === asanaProjects.length
                      ? "Deselect all"
                      : "Select all"}
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1.5 rounded-lg border p-2">
                  {asanaProjects.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No active projects found in this workspace.
                    </p>
                  ) : (
                    asanaProjects.map((p) => (
                      <div
                        key={p.gid}
                        className="flex items-center gap-2.5 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => toggleProject(p.gid)}
                      >
                        <Checkbox
                          checked={selectedGids.has(p.gid)}
                          onCheckedChange={() => toggleProject(p.gid)}
                        />
                        <span className="text-sm font-medium flex-1 truncate">
                          {p.name}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedGids.size} of {asanaProjects.length} selected
                </p>
              </div>
            </div>
          )}

          {/* ── STEP: Importing ── */}
          {step === "importing" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm font-medium">
                Importing {selectedGids.size} project
                {selectedGids.size > 1 ? "s" : ""}…
              </p>
              <p className="text-xs text-muted-foreground text-center">
                Fetching tasks and comments from Asana.
                <br />
                This may take a moment for large projects.
              </p>
            </div>
          )}

          {/* ── STEP: Done ── */}
          {step === "done" && result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600">
                <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                  <IconCheck className="h-5 w-5" />
                </div>
                <p className="font-semibold">Import successful!</p>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Projects", value: result.projects_imported },
                  { label: "Tasks", value: result.tasks_imported },
                  { label: "Files", value: result.files_imported },
                  { label: "Comments", value: result.notes_imported },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="text-center p-3 rounded-lg border bg-muted/30"
                  >
                    <p className="text-2xl font-bold text-primary">
                      {item.value}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>

              {/* Warnings about partial failures */}
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                    <IconAlertTriangle className="h-4 w-4 shrink-0" />
                    <p className="text-xs font-semibold">
                      {result.errors.length} item(s) had issues
                    </p>
                  </div>
                  <div className="max-h-28 overflow-y-auto space-y-0.5">
                    {result.errors.map((e, i) => (
                      <p
                        key={i}
                        className="text-[11px] text-amber-700 dark:text-amber-400"
                      >
                        {e}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-xs text-muted-foreground space-y-1 p-3 rounded-lg bg-muted/30">
                <p className="font-medium">What was imported:</p>
                <p>
                  • All tasks assigned to you (importer) if the Asana email
                  doesn`t match a user in your system
                </p>
                <p>
                  • Task status mapped from Asana sections (QA, Rework, etc.)
                </p>
                <p>• Task priority mapped from Asana custom fields</p>
                <p>• All comments imported as task notes</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step === "done" ? (
            <>
              <Button variant="outline" onClick={reset} className="gap-2">
                <IconRefresh className="h-4 w-4" />
                Import more
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </>
          ) : step === "importing" ? null : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>

              {step === "token" && (
                <Button
                  onClick={handleFetchWorkspaces}
                  disabled={loading || !token.trim()}
                  className="gap-2"
                >
                  {loading ? (
                    <IconLoader className="h-4 w-4 animate-spin" />
                  ) : (
                    <IconChevronRight className="h-4 w-4" />
                  )}
                  {loading ? "Connecting…" : "Connect"}
                </Button>
              )}
              {step === "workspace" && (
                <Button
                  onClick={handleFetchProjects}
                  disabled={loading || !selectedWs}
                  className="gap-2"
                >
                  {loading ? (
                    <IconLoader className="h-4 w-4 animate-spin" />
                  ) : (
                    <IconChevronRight className="h-4 w-4" />
                  )}
                  {loading ? "Loading…" : "Load Projects"}
                </Button>
              )}
              {step === "projects" && (
                <Button
                  onClick={handleImport}
                  disabled={selectedGids.size === 0}
                  className="gap-2 bg-[#F06A6A] hover:bg-[#e05555] text-white"
                >
                  <IconBrandAsana className="h-4 w-4" />
                  Import {selectedGids.size} Project
                  {selectedGids.size !== 1 ? "s" : ""}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
