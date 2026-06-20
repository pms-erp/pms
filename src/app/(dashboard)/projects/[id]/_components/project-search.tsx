"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  IconSearch,
  IconX,
  IconFolder,
  IconLoader2,
} from "@tabler/icons-react";

interface ProjectResult {
  id: string;
  name: string;
  client_name: string | null;
  status: string;
  taskCount: number;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  PLANNING: "bg-blue-100 text-blue-700",
  IN_QA: "bg-purple-100 text-purple-700",
  ON_HOLD: "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-gray-100 text-gray-600",
  CANCELLED: "bg-red-100 text-red-700",
};

export function ProjectSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [results, setResults] = useState<ProjectResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function search(query: string) {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/projects?search=${encodeURIComponent(query.trim())}&limit=8`,
      );
      if (!res.ok) return;
      const data = await res.json();
      const list: ProjectResult[] = data.data ?? data.projects ?? [];
      setResults(list);
      setOpen(true);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => search(val), 350);
  }

  function handleClear() {
    setValue("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  // REPLACE WITH:
  function handleSelect(projectId: string, e: React.MouseEvent) {
    setOpen(false);
    setValue("");
    setResults([]);
    if (e.ctrlKey || e.metaKey) {
      window.open(`/projects/${projectId}`, "_blank", "noopener,noreferrer");
    } else {
      router.push(`/projects/${projectId}`);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input */}
      <div className="relative">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          placeholder="Search projects…"
          className="pl-9 pr-8 h-9"
        />
        {loading ? (
          <IconLoader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        ) : (
          value && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={handleClear}
            >
              <IconX className="h-3.5 w-3.5" />
            </Button>
          )
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full mt-1.5 left-0 right-0 z-50 rounded-lg border bg-popover shadow-lg overflow-hidden">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No projects found for &ldquo;{value}&rdquo;
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left"
                    onClick={(e) => handleSelect(project.id, e)}
                  >
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <IconFolder className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {project.name}
                      </p>
                      {project.client_name && (
                        <p className="text-xs text-muted-foreground truncate">
                          {project.client_name}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLORS[project.status] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {project.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t px-3 py-2">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => {
                setOpen(false);
                router.push(
                  `/projects?search=${encodeURIComponent(value.trim())}`,
                );
              }}
            >
              View all results for &ldquo;{value}&rdquo; →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
