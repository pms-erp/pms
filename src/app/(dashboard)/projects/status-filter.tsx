"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

export function StatusFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentStatus = searchParams.get("status") || "ALL";

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value === "ALL") {
      params.delete("status");
    } else {
      params.set("status", value);
    }

    router.push(`/projects?${params.toString()}`);
  }

  return (
    <Select value={currentStatus} onValueChange={handleChange}>
      <SelectTrigger className="w-[150px]">
        <SelectValue placeholder="Filter by Status" />
      </SelectTrigger>

      <SelectContent>
        <SelectItem value="ALL">All</SelectItem>
        <SelectItem value="PLANNING">Planning</SelectItem>
        <SelectItem value="ACTIVE">Active</SelectItem>
        <SelectItem value="IN_QA">In QA</SelectItem>
        <SelectItem value="ON_HOLD">On Hold</SelectItem>
        <SelectItem value="COMPLETED">Completed</SelectItem>
        <SelectItem value="CANCELLED">Cancelled</SelectItem>
      </SelectContent>
    </Select>
  );
}
