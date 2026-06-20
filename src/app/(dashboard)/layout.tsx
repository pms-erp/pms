// app/(dashboard)/layout.tsx
import { AppSidebar } from "@/components/app-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PushListenerProvider } from "@/components/push-listener-provider";
import { SiteHeader } from "@/components/site-header";
import { GlobalPopups } from "@/components/global-popups";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "3.5rem",
          "--header-height": "3rem",
        } as React.CSSProperties
      }
    >
      <TooltipProvider delayDuration={0}>
        <PushListenerProvider />
        <GlobalPopups />
        <AppSidebar variant="inset" />
        <SidebarInset className="min-w-0 overflow-hidden flex flex-col">
          <SiteHeader />
          <main className="flex-1 w-full overflow-x-hidden">{children}</main>
        </SidebarInset>
      </TooltipProvider>
    </SidebarProvider>
  );
}
