"use client";

// src/app/(dashboard)/leads/_components/import-leads-dialog.tsx

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  IconUpload,
  IconLoader2,
  IconAlertCircle,
  IconCircleCheck,
  IconTag,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

type ParsedContact = {
  username: string;
  displayName: string;
  messagePreview: string;
  timestamp: string;
  isStarred: boolean;
  isProClient: boolean;
  hasLeadsLabel: boolean;
  onlineStatus: string;
  avatar: string | null;
  profileUrl: string;
  sortOrder: number;
};

type ContactWithStatus = ParsedContact & {
  selected: boolean;
  alreadyExists: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

// ─── Parser ──────────────────────────────────────────────────────────────────

function parseFiverrNav(html: string): ParsedContact[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const contacts = doc.querySelectorAll('[data-testid="contact"]');
  const results: ParsedContact[] = [];

  contacts.forEach((contact) => {
    try {
      // Sort order from translateY
      const style = contact.getAttribute("style") || "";
      const match = style.match(/translateY\((\d+)px\)/);
      const sortOrder = match ? parseInt(match[1]) : 999999;

      // Username from avatar data-track-value
      const username =
        contact
          .querySelector('[data-track-tag="avatar"]')
          ?.getAttribute("data-track-value") || "";

      if (!username) return;

      // Display name from the text paragraph
      const displayName =
        (
          contact.querySelector(
            'p[data-track-tag="text"]',
          ) as HTMLElement | null
        )?.innerText?.trim() || username;

      // Message preview - get the span text, remove "Me: " prefix
      const excerptEl = contact.querySelector(
        '.contact-excerpt span[data-track-tag="text"]',
      ) as HTMLElement | null;
      let messagePreview = excerptEl?.innerText?.trim() || "";
      // Remove "Me: " prefix if present
      messagePreview = messagePreview.replace(/^Me:\s*/i, "").trim();

      // Timestamp
      const timestamp =
        (
          contact.querySelector(
            'time[data-track-tag="box"]',
          ) as HTMLElement | null
        )?.innerText?.trim() || "";

      // Starred = has "Unstar" button (already starred)
      const isStarred = !!contact.querySelector('[aria-label="Unstar"]');

      // Pro client badge
      const isProClient = !!contact.querySelector(
        '[data-track-tag="pro_client_tier_icon"]',
      );

      // "Leads" label = has tag_solid_icon inside contact-excerpt
      // Fiverr shows a tag icon (label) when a label is applied to a contact
      const hasLeadsLabel = !!contact.querySelector(
        '.contact-excerpt [data-track-tag="tag_solid_icon"], .contact-excerpt [data-track-tag="stack"] svg[data-track-tag="tag_solid_icon"]',
      );

      // Online status
      const onlineStatus =
        contact
          .querySelector('[data-track-tag="avatar_online_indicator"]')
          ?.getAttribute("data-track-value") || "offline";

      // Avatar image
      const avatar =
        (
          contact.querySelector(
            'img[data-track-tag="image"]',
          ) as HTMLImageElement | null
        )?.src || null;

      const profileUrl = `https://www.fiverr.com/${username}`;

      results.push({
        username,
        displayName,
        messagePreview,
        timestamp,
        isStarred,
        isProClient,
        hasLeadsLabel,
        onlineStatus,
        avatar,
        profileUrl,
        sortOrder,
      });
    } catch {
      // Skip malformed contact
    }
  });

  // Sort by translateY (top = 0px = most recent)
  results.sort((a, b) => a.sortOrder - b.sortOrder);

  return results;
}

// ─── Steps ───────────────────────────────────────────────────────────────────

type Step = "paste" | "preview" | "importing" | "done";

// ─── Component ───────────────────────────────────────────────────────────────

export function ImportLeadsDialog({ open, onOpenChange, onSuccess }: Props) {
  const { data: session } = useSession();

  const [step, setStep] = useState<Step>("paste");
  const [htmlInput, setHtmlInput] = useState("");
  const [parseError, setParseError] = useState("");
  const [contacts, setContacts] = useState<ContactWithStatus[]>([]);
  const [filterMode, setFilterMode] = useState<"leads" | "all">("leads");
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);

  // ── Parse HTML ─────────────────────────────────────────────────────────

  const handleParse = useCallback(async () => {
    setParseError("");

    if (!htmlInput.trim()) {
      setParseError("Please paste the Fiverr nav HTML first.");
      return;
    }

    let parsed: ParsedContact[];
    try {
      parsed = parseFiverrNav(htmlInput);
    } catch {
      setParseError(
        "Failed to parse HTML. Make sure you copied the full nav element.",
      );
      return;
    }

    if (parsed.length === 0) {
      setParseError(
        "No contacts found. Make sure you copied the <nav> element from Fiverr inbox.",
      );
      return;
    }

    // Check which usernames already exist in PMS
    const usernames = parsed.map((c) => c.username);
    let existingUsernames: string[] = [];
    try {
      const res = await fetch("/api/leads/check-usernames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames }),
      });
      if (res.ok) {
        const data = await res.json();
        existingUsernames = data.existing ?? [];
      }
    } catch {
      // If check fails, proceed without duplicate detection
    }

    // Filter to leads-labeled only by default
    const leadsOnly = parsed.filter((c) => c.hasLeadsLabel);
    const displayList = leadsOnly.length > 0 ? leadsOnly : parsed;

    const withStatus: ContactWithStatus[] = displayList.map((c) => ({
      ...c,
      selected: !existingUsernames.includes(c.username), // pre-select non-duplicates
      alreadyExists: existingUsernames.includes(c.username),
    }));

    setContacts(withStatus);
    setFilterMode(leadsOnly.length > 0 ? "leads" : "all");
    setStep("preview");
  }, [htmlInput]);

  // ── Toggle selection ───────────────────────────────────────────────────

  function toggleContact(username: string) {
    setContacts((prev) =>
      prev.map((c) =>
        c.username === username ? { ...c, selected: !c.selected } : c,
      ),
    );
  }

  function selectAll() {
    setContacts((prev) =>
      prev.map((c) => ({ ...c, selected: !c.alreadyExists })),
    );
  }

  function deselectAll() {
    setContacts((prev) => prev.map((c) => ({ ...c, selected: false })));
  }

  // ── Import ─────────────────────────────────────────────────────────────

  async function handleImport() {
    const toImport = contacts.filter((c) => c.selected && !c.alreadyExists);

    if (toImport.length === 0) {
      toast.error("No contacts selected to import.");
      return;
    }

    setImporting(true);
    setStep("importing");

    try {
      const payload = toImport.map((c) => ({
        platform: "FIVERR",
        client_name: c.displayName,
        username: c.username,
        profile_url: c.profileUrl,
        message_preview: c.messagePreview,
        is_starred: c.isStarred,
        is_pro_client: c.isProClient,
        online_status: c.onlineStatus,
        avatar: c.avatar,
        sent_by: session?.user?.id,
      }));

      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: payload }),
      });

      if (!res.ok) throw new Error("Import failed");

      const data = await res.json();
      setImportResults({
        imported: data.imported ?? toImport.length,
        skipped: data.skipped ?? 0,
      });
      setStep("done");
    } catch {
      toast.error("Import failed. Please try again.");
      setStep("preview");
    } finally {
      setImporting(false);
    }
  }

  // ── Reset ──────────────────────────────────────────────────────────────

  function handleClose() {
    if (step === "done") {
      onSuccess();
    }
    onOpenChange(false);
    // Reset after animation
    setTimeout(() => {
      setStep("paste");
      setHtmlInput("");
      setParseError("");
      setContacts([]);
      setImportResults(null);
    }, 300);
  }

  // ── Computed ───────────────────────────────────────────────────────────

  const selectedCount = contacts.filter((c) => c.selected).length;
  const existingCount = contacts.filter((c) => c.alreadyExists).length;
  const leadsLabelCount = contacts.filter((c) => c.hasLeadsLabel).length;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconUpload size={18} className="text-primary" />
            Import Leads from Fiverr
          </DialogTitle>
        </DialogHeader>

        {/* ── STEP: Paste HTML ── */}
        {step === "paste" && (
          <div className="flex flex-col gap-4 flex-1 overflow-hidden">
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                1. Open Fiverr Inbox → right-click the contact list sidebar →
                <strong> Inspect</strong>
              </p>
              <p>
                2. Find the{" "}
                <code className="bg-muted px-1 rounded text-xs">
                  &lt;nav&gt;
                </code>{" "}
                element containing your contacts
              </p>
              <p>
                3. Right-click it → <strong>Edit as HTML</strong> → Select all →
                Copy
              </p>
              <p>4. Paste it below</p>
            </div>

            <Textarea
              placeholder="Paste Fiverr nav HTML here..."
              className="flex-1 min-h-[200px] font-mono text-xs resize-none"
              value={htmlInput}
              onChange={(e) => setHtmlInput(e.target.value)}
            />

            {parseError && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <IconAlertCircle size={16} />
                {parseError}
              </div>
            )}
          </div>
        )}

        {/* ── STEP: Preview ── */}
        {step === "preview" && (
          <div className="flex flex-col gap-3 flex-1 overflow-hidden">
            {/* Stats bar */}
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <span className="text-muted-foreground">
                Found <strong>{contacts.length}</strong> contacts
              </span>
              {leadsLabelCount > 0 && (
                <Badge variant="outline" className="gap-1">
                  <IconTag size={12} />
                  {leadsLabelCount} with Leads label
                </Badge>
              )}
              {existingCount > 0 && (
                <Badge variant="secondary" className="gap-1">
                  {existingCount} already in PMS
                </Badge>
              )}
              <span className="ml-auto font-medium text-primary">
                {selectedCount} selected
              </span>
            </div>

            {/* Select all / deselect */}
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={selectAll}
                className="text-primary hover:underline"
              >
                Select all new
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                onClick={deselectAll}
                className="text-muted-foreground hover:underline"
              >
                Deselect all
              </button>
            </div>

            {/* Contact list */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {contacts.map((contact) => (
                <label
                  key={contact.username}
                  className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    contact.alreadyExists
                      ? "opacity-50 bg-muted/30 cursor-not-allowed"
                      : contact.selected
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/30"
                  }`}
                >
                  <Checkbox
                    checked={contact.selected}
                    disabled={contact.alreadyExists}
                    onCheckedChange={() => toggleContact(contact.username)}
                    className="mt-0.5"
                  />

                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={contact.avatar ?? undefined} />
                    <AvatarFallback className="text-xs">
                      {contact.displayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-sm">
                        {contact.displayName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        @{contact.username}
                      </span>
                      {contact.isStarred && (
                        <IconStarFilled
                          size={12}
                          className="text-amber-500 shrink-0"
                        />
                      )}
                      {contact.isProClient && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1 py-0 h-4"
                        >
                          PRO
                        </Badge>
                      )}
                      {contact.hasLeadsLabel && (
                        <Badge className="text-[10px] px-1 py-0 h-4 bg-green-600">
                          Lead
                        </Badge>
                      )}
                      {contact.alreadyExists && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1 py-0 h-4"
                        >
                          Already in PMS
                        </Badge>
                      )}
                    </div>
                    {contact.messagePreview && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {contact.messagePreview}
                      </p>
                    )}
                  </div>

                  <span className="text-xs text-muted-foreground shrink-0">
                    {contact.timestamp}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: Importing ── */}
        {step === "importing" && (
          <div className="flex flex-col items-center justify-center gap-4 py-10">
            <IconLoader2 size={36} className="animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Importing {selectedCount} leads...
            </p>
          </div>
        )}

        {/* ── STEP: Done ── */}
        {step === "done" && importResults && (
          <div className="flex flex-col items-center justify-center gap-4 py-10">
            <IconCircleCheck size={48} className="text-green-500" />
            <div className="text-center">
              <p className="font-semibold text-lg">Import Complete!</p>
              <p className="text-sm text-muted-foreground mt-1">
                <strong>{importResults.imported}</strong> leads imported
                {importResults.skipped > 0 && (
                  <>
                    , <strong>{importResults.skipped}</strong> skipped
                    (duplicates)
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <DialogFooter className="mt-2">
          {step === "paste" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleParse} disabled={!htmlInput.trim()}>
                Parse Contacts
              </Button>
            </>
          )}

          {step === "preview" && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("paste");
                  setContacts([]);
                }}
              >
                Back
              </Button>
              <Button onClick={handleImport} disabled={selectedCount === 0}>
                Import {selectedCount} Lead{selectedCount !== 1 ? "s" : ""}
              </Button>
            </>
          )}

          {step === "done" && <Button onClick={handleClose}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
