// components/ui/date-time-picker.tsx
"use client";

import { useState, useReducer, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconX,
  IconClock,
} from "@tabler/icons-react";

interface DateTimePickerProps {
  value?: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  className?: string;
  minDate?: Date;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function formatDisplay(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ✅ FIX: Consolidate related state into a single object so updates are atomic
interface PickerState {
  selectedDate: Date | null;
  hours: string;
  minutes: string;
  viewYear: number;
  viewMonth: number;
}

function initState(value?: Date | null): PickerState {
  const base = value ?? new Date();
  return {
    selectedDate: value ?? null,
    hours: value ? value.getHours().toString().padStart(2, "0") : "",
    minutes: value ? value.getMinutes().toString().padStart(2, "0") : "00",
    viewYear: base.getFullYear(),
    viewMonth: base.getMonth(),
  };
}

type PickerAction =
  | { type: "SYNC_VALUE"; value: Date | null }
  | { type: "SELECT_DAY"; day: number; viewYear: number; viewMonth: number }
  | { type: "SET_TIME"; hours: string; minutes: string }
  | { type: "CLEAR" }
  | { type: "PREV_MONTH" }
  | { type: "NEXT_MONTH" };

function pickerReducer(state: PickerState, action: PickerAction): PickerState {
  switch (action.type) {
    case "SYNC_VALUE": {
      // ✅ Single atomic state update — no cascading renders
      if (!action.value)
        return { ...state, selectedDate: null, hours: "", minutes: "00" };
      return {
        selectedDate: action.value,
        hours: action.value.getHours().toString().padStart(2, "0"),
        minutes: action.value.getMinutes().toString().padStart(2, "0"),
        viewYear: action.value.getFullYear(),
        viewMonth: action.value.getMonth(),
      };
    }
    case "SELECT_DAY":
      return {
        ...state,
        selectedDate: new Date(action.viewYear, action.viewMonth, action.day),
      };
    case "SET_TIME":
      return { ...state, hours: action.hours, minutes: action.minutes };
    case "CLEAR":
      return { ...state, selectedDate: null, hours: "", minutes: "00" };
    case "PREV_MONTH":
      return state.viewMonth === 0
        ? { ...state, viewMonth: 11, viewYear: state.viewYear - 1 }
        : { ...state, viewMonth: state.viewMonth - 1 };
    case "NEXT_MONTH":
      return state.viewMonth === 11
        ? { ...state, viewMonth: 0, viewYear: state.viewYear + 1 }
        : { ...state, viewMonth: state.viewMonth + 1 };
    default:
      return state;
  }
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Select date & time",
  className,
  minDate,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [state, dispatch] = useReducer(pickerReducer, value, initState);
  const { selectedDate, hours, minutes, viewYear, viewMonth } = state;
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ✅ FIX: Single dispatch = single state update, no cascading renders
  useEffect(() => {
    dispatch({ type: "SYNC_VALUE", value: value ?? null });
  }, [value]);

  function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
  }
  function getFirstDayOfMonth(year: number, month: number) {
    return new Date(year, month, 1).getDay();
  }

  function buildDate(date: Date, h: string, m: string): Date {
    const d = new Date(date);
    d.setHours(parseInt(h) || 0, parseInt(m) || 0, 0, 0);
    return d;
  }

  function handleDayClick(day: number) {
    dispatch({ type: "SELECT_DAY", day, viewYear, viewMonth });
    const d = new Date(viewYear, viewMonth, day);
    onChange(buildDate(d, hours, minutes));
  }

  function handleTimeChange(h: string, m: string) {
    dispatch({ type: "SET_TIME", hours: h, minutes: m });
    if (selectedDate) onChange(buildDate(selectedDate, h, m));
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    dispatch({ type: "CLEAR" });
    onChange(null);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isSelected = (day: number) => {
    if (!selectedDate) return false;
    return (
      selectedDate.getFullYear() === viewYear &&
      selectedDate.getMonth() === viewMonth &&
      selectedDate.getDate() === day
    );
  };

  const isDisabled = (day: number) => {
    if (!minDate) return false;
    const d = new Date(viewYear, viewMonth, day);
    d.setHours(0, 0, 0, 0);
    return d < minDate;
  };

  const isToday = (day: number) =>
    today.getFullYear() === viewYear &&
    today.getMonth() === viewMonth &&
    today.getDate() === day;

  return (
    <div ref={ref} className={cn("relative", className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-2 w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-left",
          "hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors",
          !selectedDate && "text-muted-foreground",
        )}
      >
        <IconCalendar className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">
          {selectedDate ? formatDisplay(selectedDate) : placeholder}
        </span>
        {selectedDate && (
          <IconX
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleClear}
          />
        )}
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute z-50 mt-1 rounded-lg border bg-popover shadow-lg p-3 w-72 left-0">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => dispatch({ type: "PREV_MONTH" })}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <IconChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={() => dispatch({ type: "NEXT_MONTH" })}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <IconChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map((d) => (
              <div
                key={d}
                className="text-center text-xs text-muted-foreground py-1 font-medium"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, i) => (
              <div key={i} className="flex justify-center">
                {day ? (
                  <button
                    type="button"
                    disabled={isDisabled(day)}
                    onClick={() => handleDayClick(day)}
                    className={cn(
                      "h-8 w-8 rounded-full text-sm transition-colors",
                      isSelected(day) &&
                        "bg-primary text-primary-foreground font-semibold",
                      !isSelected(day) &&
                        isToday(day) &&
                        "border border-primary text-primary font-semibold",
                      !isSelected(day) &&
                        !isToday(day) &&
                        !isDisabled(day) &&
                        "hover:bg-muted",
                      isDisabled(day) &&
                        "text-muted-foreground opacity-40 cursor-not-allowed",
                    )}
                  >
                    {day}
                  </button>
                ) : (
                  <div className="h-8 w-8" />
                )}
              </div>
            ))}
          </div>

          {/* Time picker */}
          <div className="mt-3 pt-3 border-t">
            <div className="flex items-center gap-2">
              <IconClock className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium text-muted-foreground">
                Time (optional)
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Input
                type="number"
                min="0"
                max="23"
                value={hours}
                onChange={(e) =>
                  handleTimeChange(e.target.value.padStart(2, "0"), minutes)
                }
                placeholder="HH"
                className="h-8 text-center text-sm w-16"
              />
              <span className="text-muted-foreground font-bold">:</span>
              <Input
                type="number"
                min="0"
                max="59"
                value={minutes}
                onChange={(e) =>
                  handleTimeChange(hours, e.target.value.padStart(2, "0"))
                }
                placeholder="MM"
                className="h-8 text-center text-sm w-16"
              />
              <span className="text-xs text-muted-foreground ml-1">24h</span>
            </div>
          </div>

          {/* Done button */}
          <Button
            type="button"
            size="sm"
            className="w-full mt-3 h-8"
            onClick={() => setOpen(false)}
            disabled={!selectedDate}
          >
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
