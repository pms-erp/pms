"use client";

import * as React from "react";
import { z } from "zod";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  IconChevronLeft,
  IconChevronRight,
  IconDotsVertical,
  IconMail,
} from "@tabler/icons-react";

import Link from "next/link";
import { EditUserDialog } from "./edit-role-dialog";
import { ToggleUserStatusDialog } from "./deactivate-user-dialog";

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  email: z.string().nullable().optional(),
  role: z.string(),
  team_type: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.string(),
});

type User = z.infer<typeof userSchema>;

const createStaffColumns = (currentUserRole: string): ColumnDef<User>[] => [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <Link
        href={`/users/${row.original.id}`}
        className="font-medium hover:underline text-primary"
        onClick={(e) => e.stopPropagation()}
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "username",
    header: "Username",
    cell: ({ row }) => (
      <span className="font-mono text-sm">@{row.original.username}</span>
    ),
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) =>
      row.original.email ? (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <IconMail className="h-3.5 w-3.5 shrink-0" />
          {row.original.email}
        </span>
      ) : (
        <span className="text-muted-foreground/50 text-sm">—</span>
      ),
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => <Badge variant="outline">{row.original.role}</Badge>,
  },
  {
    accessorKey: "team_type",
    header: "Team",
    cell: ({ row }) =>
      row.original.team_type ? (
        <Badge variant="secondary">{row.original.team_type}</Badge>
      ) : (
        <span className="text-muted-foreground/50 text-sm">—</span>
      ),
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) =>
      row.original.is_active ? (
        <Badge className="bg-green-500 text-white">Active</Badge>
      ) : (
        <Badge variant="destructive">Inactive</Badge>
      ),
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => new Date(row.original.created_at).toLocaleDateString(),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <IconDotsVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <EditUserDialog
            user={row.original}
            currentUserRole={currentUserRole}
          />
          <ToggleUserStatusDialog
            userId={row.original.id}
            username={row.original.username}
            is_active={row.original.is_active}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

const createClientColumns = (currentUserRole: string): ColumnDef<User>[] => [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <Link
        href={`/users/${row.original.id}`}
        className="font-medium hover:underline text-primary"
        onClick={(e) => e.stopPropagation()}
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "username",
    header: "Username",
    cell: ({ row }) => (
      <span className="font-mono text-sm">@{row.original.username}</span>
    ),
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) =>
      row.original.email ? (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <IconMail className="h-3.5 w-3.5 shrink-0" />
          {row.original.email}
        </span>
      ) : (
        <span className="text-muted-foreground/50 text-sm">—</span>
      ),
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => <Badge variant="outline">{row.original.role}</Badge>,
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) =>
      row.original.is_active ? (
        <Badge className="bg-green-500 text-white">Active</Badge>
      ) : (
        <Badge variant="destructive">Inactive</Badge>
      ),
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => new Date(row.original.created_at).toLocaleDateString(),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <IconDotsVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <EditUserDialog
            user={row.original}
            currentUserRole={currentUserRole}
          />
          <ToggleUserStatusDialog
            userId={row.original.id}
            username={row.original.username}
            is_active={row.original.is_active}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

// ── Reusable inner table ────────────────────────────────────────────────────
function UserTable({
  data,
  columns,
  emptyMessage = "No users found.",
}: {
  data: User[];
  columns: ColumnDef<User>[];
  emptyMessage?: string;
}) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState({});

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {table.getPageCount()}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <IconChevronLeft size={16} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <IconChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────
export function DataTable({
  data,
  currentUserRole,
}: {
  data: User[];
  currentUserRole: string;
}) {
  const staffUsers = data.filter((u) => u.role !== "CLIENT");
  const clientUsers = data.filter((u) => u.role === "CLIENT");

  const staffColumns = createStaffColumns(currentUserRole);
  const clientColumns = createClientColumns(currentUserRole);

  return (
    <Tabs defaultValue="staff">
      <TabsList className="mb-4">
        <TabsTrigger value="staff">
          Staff
          <Badge variant="secondary" className="ml-2">
            {staffUsers.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="clients">
          Clients
          <Badge variant="secondary" className="ml-2">
            {clientUsers.length}
          </Badge>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="staff">
        <UserTable
          data={staffUsers}
          columns={staffColumns}
          emptyMessage="No staff users found."
        />
      </TabsContent>

      <TabsContent value="clients">
        <UserTable
          data={clientUsers}
          columns={clientColumns}
          emptyMessage="No clients found."
        />
      </TabsContent>
    </Tabs>
  );
}
