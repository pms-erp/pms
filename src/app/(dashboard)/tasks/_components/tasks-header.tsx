"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CreateTaskDialog } from "./create-task-dialog";
import { useDebounce } from "@/hooks/use-debounce";
import { IconSearch, IconLoader } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

type TaskSuggestion = {
  id: string;
  title: string;
  name?: string;
  projectName?: string;
  team_type?: string;
  priority?: "HIGH" | "MEDIUM" | "LOW";
};

interface TasksHeaderProps {
  params: {
    status?: string;
    team?: string;
    priority?: string;
    search?: string;
    page?: string;
  };
  onFilterChange: (newParams: Record<string, string>) => void;
  onTaskCreated: () => void;
  userRole: string;
}

const PRIVILEGED_ROLES = ["TEAM_LEADER", "ADMIN", "PROJECT_MANAGER"];
const TEAM_FILTER_ROLES = ["ADMIN", "PROJECT_MANAGER"];

export function TasksHeader({
  params,
  onFilterChange,
  onTaskCreated,
  userRole,
}: TasksHeaderProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(params.search || "");
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [teams, setTeams] = useState<
    { id: string; name: string; slug: string }[]
  >([]);

  const isQA = userRole === "QA";
  const canCreateTask = PRIVILEGED_ROLES.includes(userRole);
  const canSeeTeamFilter = TEAM_FILTER_ROLES.includes(userRole);

  const currentStatus = params.status || "all";
  const currentTeam = params.team || "all";
  const currentPriority = params.priority || "all";

  const debouncedSearch = useDebounce(searchQuery, 500);

  useEffect(() => {
    fetch("/api/teams")
      .then((r) => r.json())
      .then((data) => setTeams(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setSearchQuery(params.search || "");
  }, [params.search]);

  useEffect(() => {
    if (debouncedSearch.length < 2) {
      setSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      setLoadingSuggestions(true);
      try {
        const res = await fetch(
          `/api/tasks/search-suggestions?q=${encodeURIComponent(debouncedSearch)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions((data.suggestions as TaskSuggestion[]) || []);
        }
      } catch (error) {
        console.error("Failed to fetch suggestions:", error);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    fetchSuggestions();
  }, [debouncedSearch]);

  const handleStatusChange = (value: string) => {
    onFilterChange({ status: value === "all" ? "" : value });
  };

  const handleTeamChange = (value: string) => {
    onFilterChange({ team: value === "all" ? "" : value });
  };

  const handlePriorityChange = (value: string) => {
    onFilterChange({ priority: value === "all" ? "" : value });
  };

  const handleSearchSubmit = (value: string) => {
    onFilterChange({ search: value.trim() });
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearchSubmit(searchQuery);
    }
  };

  const handleSuggestionSelect = (suggestion: TaskSuggestion) => {
    handleSearchSubmit(suggestion.title || suggestion.name || "");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground mt-1">
            Manage and track all tasks across projects
          </p>
        </div>
        {canCreateTask && <CreateTaskDialog onTaskCreated={onTaskCreated} />}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {/* Status Filter */}
        <Select value={currentStatus} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {/* QA sees "In Progress" which maps to WAITING_FOR_QA */}
            {isQA ? (
              <SelectItem value="WAITING_FOR_QA">In Progress</SelectItem>
            ) : (
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            )}
            {/* Hide "Waiting for QA" from QA users — those are their in-progress tasks */}
            {!isQA && (
              <SelectItem value="WAITING_FOR_QA">Waiting for QA</SelectItem>
            )}
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REWORK">Rework</SelectItem>
          </SelectContent>
        </Select>

        {/* Team Filter — only Admin and Project Manager */}
        {canSeeTeamFilter && (
          <Select value={currentTeam} onValueChange={handleTeamChange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Filter by team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.slug}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Priority Filter */}
        <Select value={currentPriority} onValueChange={handlePriorityChange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Filter by priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="HIGH">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                High
              </div>
            </SelectItem>
            <SelectItem value="MEDIUM">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                Medium
              </div>
            </SelectItem>
            <SelectItem value="LOW">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                Low
              </div>
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Search */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <div
              className="flex-1 max-w-sm relative cursor-text group"
              onClick={() => setOpen(true)}
            >
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9 w-full focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search tasks..."
                value={searchQuery}
                onValueChange={setSearchQuery}
                onKeyDown={handleKeyDown}
                className="border-0 focus:ring-0"
              />
              <CommandList>
                <CommandEmpty>
                  {loadingSuggestions ? (
                    <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
                      <IconLoader className="h-4 w-4 animate-spin" />
                      Searching...
                    </div>
                  ) : searchQuery.length < 2 ? (
                    "Type at least 2 characters"
                  ) : (
                    "No results found"
                  )}
                </CommandEmpty>
                <CommandGroup heading="Suggestions">
                  {suggestions.map((suggestion) => (
                    <CommandItem
                      key={suggestion.id}
                      value={suggestion.title}
                      onSelect={() => handleSuggestionSelect(suggestion)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <IconSearch className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {suggestion.title}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {suggestion.projectName} • {suggestion.team_type}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full",
                            suggestion.priority === "HIGH"
                              ? "bg-red-100 text-red-700"
                              : suggestion.priority === "MEDIUM"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-green-100 text-green-700",
                          )}
                        >
                          {suggestion.priority}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {searchQuery && (
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => handleSearchSubmit(searchQuery)}
                      className="cursor-pointer text-primary font-medium"
                    >
                      <IconSearch className="mr-2 h-4 w-4" />
                      Search for `{searchQuery}`
                    </CommandItem>
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
