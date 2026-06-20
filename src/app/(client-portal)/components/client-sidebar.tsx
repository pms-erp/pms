"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { IconHome, IconFolder, IconDots } from "@tabler/icons-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { signOut } from "next-auth/react";
import {
  IconLogout,
  IconUserCircle,
  IconDotsVertical,
} from "@tabler/icons-react";
import Link from "next/link";

const navItems = [
  { title: "Dashboard", url: "/client", icon: IconHome },
  { title: "Projects", url: "/client/projects", icon: IconFolder },
];

function ClientNavMain() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {navItems.map((item) => {
            const isActive =
              item.url === "/client"
                ? pathname === "/client"
                : pathname.startsWith(item.url);
            return (
              <SidebarMenuItem key={item.title}>
                <Link
                  href={item.url}
                  onClick={() => isMobile && setOpenMobile(false)}
                >
                  <SidebarMenuButton
                    tooltip={item.title}
                    className={
                      isActive
                        ? "bg-primary text-primary-foreground font-medium hover:bg-primary hover:text-primary-foreground"
                        : "hover:bg-muted/50"
                    }
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function ClientNavUser({ user }: { user: { name: string; email: string } }) {
  const { isMobile } = useSidebar();

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-black text-white text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {user.email}
                </span>
              </div>
              <IconDotsVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <div className="flex items-center gap-2 px-2 py-2 text-sm border-b">
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-black text-white text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {user.email}
                </span>
              </div>
            </div>
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <IconLogout className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function ClientSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string };
}) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu className="border-b pb-2">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link href="/client">
                <img
                  src="/logo.webp"
                  alt="TAIBA Digital"
                  className="h-6 w-auto shrink-0 object-contain"
                />
                <span className="text-base font-semibold truncate">
                  Client Portal
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <ClientNavMain />
      </SidebarContent>

      <SidebarFooter>
        <ClientNavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
