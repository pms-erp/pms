"use client";
// src/app/(dashboard)/projects/[id]/_components/project-chat-panel.tsx

import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import {
  Loader2,
  Send,
  MessageSquare,
  Paperclip,
  X,
  Pencil,
  Trash2,
  Check,
  MoreHorizontal,
  FileText,
  Image as ImageIcon,
  ListOrdered,
  Link as LinkIcon,
} from "lucide-react";
import Pusher from "pusher-js";
import { toast } from "sonner";

type Attachment = {
  url: string;
  public_id: string;
  name: string;
  storage: "cloudinary" | "r2";
  resource_type: "image" | "video" | "raw";
  size?: number;
};

type ChatMessage = {
  id: string;
  project_id: string;
  message: string;
  attachment: string | null;
  created_at: string;
  edited_at: string | null;
  is_deleted: boolean;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  senderRole: string;
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  PROJECT_MANAGER: "PM",
  TEAM_LEADER: "Lead",
  DEVELOPER: "Dev",
  DESIGNER: "Designer",
  PROGRAMMER: "Programmer",
  QA: "QA",
  CLIENT: "Client",
};

const VERCEL_SAFE_MAX = 4 * 1024 * 1024;

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({
  name,
  avatar,
  role,
}: {
  name: string;
  avatar: string | null;
  role: string;
}) {
  const isClient = role === "CLIENT";
  const bg = isClient ? "bg-violet-600" : "bg-blue-600";
  if (avatar)
    return (
      <img
        src={avatar}
        alt={name}
        className={`h-7 w-7 rounded-full object-cover shrink-0 ${isClient ? "ring-2 ring-violet-300" : ""}`}
      />
    );
  return (
    <div
      className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ${bg}`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function AttachmentPreview({
  raw,
  light = false,
}: {
  raw: string | null;
  light?: boolean;
}) {
  if (!raw) return null;
  let att: Attachment;
  try {
    att = JSON.parse(raw) as Attachment;
  } catch {
    return null;
  }
  if (att.resource_type === "image") {
    return (
      <a
        href={att.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block mt-2"
      >
        <img
          src={att.url}
          alt={att.name}
          className="max-h-44 max-w-[260px] rounded-xl border border-gray-200 object-cover hover:opacity-90 transition-opacity"
        />
      </a>
    );
  }
  const ext = att.name?.split(".").pop()?.toUpperCase() ?? "FILE";
  return (
    <a
      href={att.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 mt-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors max-w-[220px] ${
        light
          ? "bg-white/25 hover:bg-white/40 border border-white/20 text-white"
          : "bg-gray-100 hover:bg-gray-200 text-gray-700"
      }`}
    >
      <FileText className="h-3.5 w-3.5 shrink-0 opacity-70" />
      <span className="truncate">{att.name}</span>
      <span className="shrink-0 opacity-50 font-medium">{ext}</span>
    </a>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProjectChatPanel({ projectId }: { projectId: string }) {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role ?? "";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(false);

  // ── Rich text editor ──────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      TiptapLink.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-blue-400 underline cursor-pointer" },
      }),
    ],
    content: "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-[40px] max-h-[120px] overflow-y-auto text-sm outline-none whitespace-pre-wrap break-words [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-0.5 [&_a]:text-blue-500 [&_a]:underline [&_strong]:font-semibold [&_em]:italic",
      },
    },
  });

  const setLink = useCallback(() => {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, "");
    if (selected) {
      const url = selected.startsWith("http")
        ? selected
        : `https://${selected}`;
      editor.chain().focus().setLink({ href: url }).run();
      return;
    }
    const url = window.prompt("Enter URL", "https://");
    if (url) editor.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  // ── Load messages ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/client/messages?projectId=${projectId}&limit=50`)
      .then(async (r) => {
        if (r.status === 403) {
          setAccessDenied(true);
          return;
        }
        const d = await r.json();
        setMessages(d.messages ?? []);
      })
      .catch(() => {}) // network error — show empty state
      .finally(() => setLoading(false));
  }, [projectId]);

  // ── Pusher ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    // Skip Pusher setup if env vars are missing — messages still load via fetch
    if (!pusherKey || !pusherCluster) return;
    const pusher = new Pusher(pusherKey, { cluster: pusherCluster });
    const ch = pusher.subscribe(`project-chat-${projectId}`);
    ch.bind("new_message", (data: ChatMessage) => {
      setMessages((prev) =>
        prev.some((m) => m.id === data.id) ? prev : [...prev, data],
      );
    });
    ch.bind(
      "message_edited",
      (data: { id: string; message: string; edited_at: string }) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === data.id ? { ...m, ...data } : m)),
        );
      },
    );
    ch.bind("message_deleted", (data: { id: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.id
            ? { ...m, is_deleted: true, message: "", attachment: null }
            : m,
        ),
      );
    });
    return () => {
      ch.unbind_all();
      pusher.unsubscribe(`project-chat-${projectId}`);
      pusher.disconnect();
    };
  }, [projectId]);

  // ── Scroll ────────────────────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    wasAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    if (wasAtBottom.current)
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!menuOpenId) return;
    const h = () => setMenuOpenId(null);
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [menuOpenId]);

  // ── Upload ────────────────────────────────────────────────────────────────
  async function uploadFile(file: File): Promise<Attachment | null> {
    setUploading(true);
    try {
      if (file.size < VERCEL_SAFE_MAX) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        return {
          url: data.url,
          public_id: data.public_id,
          name: file.name,
          storage: "cloudinary",
          resource_type: data.resource_type ?? "raw",
          size: file.size,
        };
      } else {
        const pr = await fetch("/api/upload/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
          }),
        });
        const pd = await pr.json();
        if (!pr.ok) throw new Error(pd.error ?? "Presign failed");
        await fetch(pd.presignedUrl, {
          method: "PUT",
          headers: { "Content-Type": pd.contentType },
          body: file,
        });
        return {
          url: pd.publicUrl,
          public_id: pd.key,
          name: file.name,
          storage: "r2",
          resource_type: pd.resource_type ?? "raw",
          size: file.size,
        };
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      return null;
    } finally {
      setUploading(false);
    }
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    if (!editor) return;
    const html = editor.getHTML();
    const hasText = !editor.isEmpty && html !== "<p></p>";
    const hasFile = !!pendingFile;
    // Must have at least text OR a file
    if ((!hasText && !hasFile) || sending || uploading) return;

    setSending(true);
    let attachment: Attachment | null = null;
    if (hasFile) {
      attachment = await uploadFile(pendingFile!);
      // Upload failed and no text — abort
      if (!attachment && !hasText) {
        setSending(false);
        return;
      }
    }
    setPendingFile(null);
    wasAtBottom.current = true;
    editor.commands.clearContent();

    try {
      await fetch("/api/client/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          message: hasText ? html : "",
          attachment: attachment ? JSON.stringify(attachment) : undefined,
        }),
      });
    } finally {
      setSending(false);
    }
  }, [editor, pendingFile, projectId, sending, uploading]);

  // ── Edit / Delete ─────────────────────────────────────────────────────────
  async function submitEdit(messageId: string) {
    if (!editText.trim()) return;
    const res = await fetch(`/api/client/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: editText }),
    });
    if (res.ok) {
      setEditingId(null);
      setEditText("");
    } else {
      const d = await res.json();
      toast.error(d.error ?? "Failed to edit");
    }
  }

  async function deleteMessage(messageId: string) {
    const res = await fetch(`/api/client/messages/${messageId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const d = await res.json();
      toast.error(d.error ?? "Failed to delete");
    }
    setMenuOpenId(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full border border-gray-200 rounded-2xl bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="h-2 w-2 rounded-full bg-emerald-400" />
        <MessageSquare className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-semibold text-gray-800">
          Project Chat
        </span>
        <span className="ml-auto text-xs text-gray-400">
          Shared with client
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0"
      >
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
          </div>
        )}
        {!loading && accessDenied && (
          <div className="text-center py-8 text-sm text-gray-400">
            You don&apos;t have access to this project&apos;s chat.
          </div>
        )}
        {!loading && !accessDenied && messages.length === 0 && (
          <div className="text-center py-8 text-sm text-gray-400">
            No messages yet.
          </div>
        )}

        {messages.map((msg) => {
          const isMe = msg.senderId === userId;
          const canEdit = isMe && !msg.is_deleted;
          const canDelete =
            !msg.is_deleted &&
            (isMe || userRole === "ADMIN" || userRole === "PROJECT_MANAGER");
          const showMenu = canEdit || canDelete;

          if (msg.is_deleted) {
            return (
              <div key={msg.id} className="flex justify-center">
                <span className="text-xs text-gray-300 italic bg-gray-50 rounded-full px-3 py-1">
                  Message deleted
                </span>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`flex items-end gap-2 group ${isMe ? "flex-row-reverse" : ""}`}
            >
              <Avatar
                name={msg.senderName}
                avatar={msg.senderAvatar}
                role={msg.senderRole}
              />

              <div
                className={`max-w-[75%] flex flex-col ${isMe ? "items-end" : "items-start"}`}
              >
                {/* Meta */}
                <div
                  className={`flex items-center gap-1.5 mb-1 ${isMe ? "flex-row-reverse" : ""}`}
                >
                  <span className="text-xs font-medium text-gray-600">
                    {isMe ? "You" : msg.senderName}
                  </span>
                  {msg.senderRole === "CLIENT" ? (
                    <span className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded font-medium">
                      Client
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-400">
                      {ROLE_LABEL[msg.senderRole] ?? msg.senderRole}
                    </span>
                  )}
                  <span className="text-[11px] text-gray-300">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {msg.edited_at && (
                    <span className="text-[11px] text-gray-300 italic">
                      edited
                    </span>
                  )}
                </div>

                {/* Bubble + menu */}
                <div
                  className={`flex items-end gap-1 ${isMe ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      isMe
                        ? "bg-blue-600 text-white rounded-br-sm"
                        : msg.senderRole === "CLIENT"
                          ? "bg-violet-50 text-gray-800 border border-violet-200 rounded-bl-sm"
                          : "bg-gray-100 text-gray-800 rounded-bl-sm"
                    }`}
                  >
                    <div
                      className="prose prose-sm max-w-none [&_a]:underline [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4"
                      dangerouslySetInnerHTML={{ __html: msg.message }}
                    />
                    <AttachmentPreview raw={msg.attachment} light={isMe} />
                  </div>

                  {showMenu && (
                    <div className="relative self-center opacity-0 group-hover:opacity-100 transition-opacity mb-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === msg.id ? null : msg.id);
                        }}
                        className="h-6 w-6 rounded-full flex items-center justify-center text-gray-300 hover:bg-gray-100 hover:text-gray-500 transition-colors"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                      {menuOpenId === msg.id && (
                        <div
                          className={`absolute z-20 bg-white border border-gray-100 rounded-xl shadow-lg py-1 w-28 ${isMe ? "right-0" : "left-0"} bottom-8`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canEdit && (
                            <button
                              onClick={() => {
                                setEditingId(msg.id);
                                setEditText(msg.message);
                                setMenuOpenId(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => deleteMessage(msg.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Edit bar */}
      {editingId && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-100 shrink-0">
          <div className="flex items-center gap-2">
            <Pencil className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="text-xs text-amber-700 font-medium flex-1">
              Editing message
            </span>
            <button
              onClick={() => {
                setEditingId(null);
                setEditText("");
              }}
              className="text-amber-400 hover:text-amber-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitEdit(editingId);
                if (e.key === "Escape") {
                  setEditingId(null);
                  setEditText("");
                }
              }}
              className="flex-1 text-sm border border-amber-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-300 bg-white"
            />
            <button
              onClick={() => submitEdit(editingId)}
              className="h-8 w-8 rounded-lg bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600 transition-colors"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Pending file preview */}
      {pendingFile && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 shrink-0">
          <div className="flex items-center gap-2 text-xs text-blue-700">
            {pendingFile.type.startsWith("image/") ? (
              <ImageIcon className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate flex-1 font-medium">
              {pendingFile.name}
            </span>
            <span className="shrink-0 text-blue-400">
              {(pendingFile.size / 1024).toFixed(0)} KB
            </span>
            <button
              onClick={() => setPendingFile(null)}
              className="shrink-0 text-blue-400 hover:text-blue-600 ml-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Composer — always rendered; toolbar appears once Tiptap hydrates */}
      {!accessDenied && (
        <div className="border-t border-gray-100 shrink-0">
          {editor ? (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-0.5 px-3 pt-2 pb-1">
                {[
                  {
                    label: "B",
                    title: "Bold",
                    action: () => editor.chain().focus().toggleBold().run(),
                    active: editor.isActive("bold"),
                    cls: "font-bold",
                  },
                  {
                    label: "I",
                    title: "Italic",
                    action: () => editor.chain().focus().toggleItalic().run(),
                    active: editor.isActive("italic"),
                    cls: "italic",
                  },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    title={btn.title}
                    onClick={btn.action}
                    className={`h-6 w-6 rounded text-xs flex items-center justify-center transition-colors ${btn.cls} ${btn.active ? "bg-gray-200 text-gray-900" : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"}`}
                  >
                    {btn.label}
                  </button>
                ))}
                <button
                  type="button"
                  title="Bullet list"
                  onClick={() =>
                    editor.chain().focus().toggleBulletList().run()
                  }
                  className={`h-6 w-6 rounded flex items-center justify-center text-xs transition-colors ${editor.isActive("bulletList") ? "bg-gray-200 text-gray-700" : "text-gray-400 hover:bg-gray-100"}`}
                >
                  •
                </button>
                <button
                  type="button"
                  title="Numbered list"
                  onClick={() =>
                    editor.chain().focus().toggleOrderedList().run()
                  }
                  className={`h-6 w-6 rounded flex items-center justify-center transition-colors ${editor.isActive("orderedList") ? "bg-gray-200 text-gray-700" : "text-gray-400 hover:bg-gray-100"}`}
                >
                  <ListOrdered className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title="Link"
                  onClick={setLink}
                  className={`h-6 w-6 rounded flex items-center justify-center transition-colors ${editor.isActive("link") ? "bg-gray-200 text-gray-700" : "text-gray-400 hover:bg-gray-100"}`}
                >
                  <LinkIcon className="h-3 w-3" />
                </button>
                <span className="ml-auto text-[10px] text-gray-300">
                  Enter · send
                </span>
              </div>

              {/* Editor + send */}
              <div className="px-3 pb-3 flex items-end gap-1.5">
                <div
                  className="flex-1 min-h-[40px] max-h-[120px] overflow-y-auto"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                >
                  <EditorContent editor={editor} />
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setPendingFile(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || uploading}
                  className="h-8 w-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 transition-colors shrink-0"
                  title="Attach file"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <button
                  onClick={send}
                  disabled={sending || uploading}
                  className="h-8 w-8 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  {sending || uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </>
          ) : (
            /* Tiptap not yet hydrated — show simple fallback input */
            <div className="px-3 py-3 flex items-center gap-1.5">
              <div className="flex-1 h-10 bg-gray-100 rounded-xl animate-pulse" />
              <div className="h-8 w-8 bg-gray-100 rounded-xl animate-pulse shrink-0" />
              <div className="h-8 w-8 bg-blue-200 rounded-xl animate-pulse shrink-0" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
