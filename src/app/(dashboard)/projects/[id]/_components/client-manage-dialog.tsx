"use client";
// src/app/(dashboard)/projects/[id]/_components/client-manage-dialog.tsx
// Admin/PM can invite CLIENT users to a project and mark task comments as client-visible.

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Users, UserPlus, Trash2, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

type LinkedClient = {
  linkId: string;
  clientId: string;
  clientName: string;
  clientUsername: string;
  clientEmail: string | null;
  clientAvatar: string | null;
  linkedAt: string;
};

type AllClient = {
  id: string;
  name: string;
  username: string;
  email: string | null;
};

type TaskNote = {
  id: string;
  task_title: string;
  note: string;
  note_type: string;
  is_client_visible: boolean;
  created_at: string;
  commenterName: string;
};

export function ClientManageDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"clients" | "comments">("clients");

  // Clients state
  const [linkedClients, setLinkedClients] = useState<LinkedClient[]>([]);
  const [allClients, setAllClients] = useState<AllClient[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [linking, setLinking] = useState(false);

  // Comments state
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);

  // ── Fetch data when dialog opens ──────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    // Load linked clients
    setLoadingClients(true);
    Promise.all([
      fetch(`/api/client/projects/manage?projectId=${projectId}`).then((r) =>
        r.json(),
      ),
      fetch(`/api/users?role=CLIENT&active=true`).then((r) => r.json()),
    ])
      .then(([managed, users]) => {
        setLinkedClients(managed.clients ?? []);
        setAllClients(users.users ?? []);
      })
      .finally(() => setLoadingClients(false));

    // Load task comments for this project
    setLoadingNotes(true);
    fetch(`/api/client/project-notes?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => setNotes(d.notes ?? []))
      .finally(() => setLoadingNotes(false));
  }, [open, projectId]);

  // ── Link client ───────────────────────────────────────────────────────────
  async function linkClient() {
    if (!selectedClientId) return;
    setLinking(true);
    try {
      const res = await fetch("/api/client/projects/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selectedClientId, projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Client linked to project");
      // Refresh linked list
      const refreshed = await fetch(
        `/api/client/projects/manage?projectId=${projectId}`,
      ).then((r) => r.json());
      setLinkedClients(refreshed.clients ?? []);
      setSelectedClientId("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to link client");
    } finally {
      setLinking(false);
    }
  }

  // ── Unlink client ─────────────────────────────────────────────────────────
  async function unlinkClient(clientId: string) {
    try {
      const res = await fetch("/api/client/projects/manage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, projectId }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Client removed");
      setLinkedClients((prev) => prev.filter((c) => c.clientId !== clientId));
    } catch {
      toast.error("Failed to remove client");
    }
  }

  // ── Toggle comment client visibility ─────────────────────────────────────
  async function toggleNoteVisibility(noteId: string, current: boolean) {
    try {
      const res = await fetch(`/api/client/project-notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_client_visible: !current }),
      });
      if (!res.ok) throw new Error("Failed");
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId ? { ...n, is_client_visible: !current } : n,
        ),
      );
      toast.success(
        !current ? "Comment visible to client" : "Comment hidden from client",
      );
    } catch {
      toast.error("Failed to update comment visibility");
    }
  }

  // ── Available clients to link (not already linked) ────────────────────────
  const availableClients = allClients.filter(
    (c) => !linkedClients.some((l) => l.clientId === c.id),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Users className="h-4 w-4" />
          Client Access
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Client Portal Access</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-4">
          {(["clients", "comments"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "clients" ? "Linked Clients" : "Comment Visibility"}
            </button>
          ))}
        </div>

        {/* ── CLIENTS TAB ────────────────────────────────────────────────── */}
        {tab === "clients" && (
          <div>
            {/* Add client */}
            <div className="flex gap-2 mb-5">
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a client to invite…</option>
                {availableClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.username})
                  </option>
                ))}
              </select>
              <Button
                onClick={linkClient}
                disabled={!selectedClientId || linking}
                size="sm"
                className="gap-1.5"
              >
                {linking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Invite
              </Button>
            </div>

            {/* Linked clients list */}
            {loadingClients ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
              </div>
            ) : linkedClients.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                No clients linked yet.
              </p>
            ) : (
              <div className="space-y-2">
                {linkedClients.map((c) => (
                  <div
                    key={c.clientId}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="h-8 w-8 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-semibold">
                      {c.clientName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {c.clientName}
                      </p>
                      <p className="text-xs text-gray-400">
                        @{c.clientUsername}
                        {c.clientEmail ? ` · ${c.clientEmail}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => unlinkClient(c.clientId)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      title="Remove client access"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── COMMENTS TAB ───────────────────────────────────────────────── */}
        {tab === "comments" && (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              Toggle which task comments are visible to the client in their
              portal.
            </p>
            {loadingNotes ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
              </div>
            ) : notes.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                No comments on this project yet.
              </p>
            ) : (
              <div className="space-y-2">
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                      n.is_client_visible
                        ? "bg-green-50 border-green-200"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-500 mb-0.5">
                        {n.task_title} · {n.commenterName}
                      </p>
                      <p className="text-sm text-gray-700 line-clamp-2">
                        {n.note}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        toggleNoteVisibility(n.id, n.is_client_visible)
                      }
                      className={`p-1.5 rounded-md transition-colors ${
                        n.is_client_visible
                          ? "text-green-600 hover:bg-green-100"
                          : "text-gray-400 hover:bg-gray-200"
                      }`}
                      title={
                        n.is_client_visible
                          ? "Hide from client"
                          : "Show to client"
                      }
                    >
                      {n.is_client_visible ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
