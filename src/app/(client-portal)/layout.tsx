import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AuthProvider from "@/components/AuthProvider";
import { Toaster } from "sonner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ClientSidebar } from "./components/client-sidebar";

export default async function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "CLIENT") redirect("/");

  const user = {
    name: session.user.name ?? "Client",
    email: session.user.email ?? "",
  };

  return (
    <AuthProvider>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "16rem",
            "--sidebar-width-icon": "3.5rem",
            "--header-height": "3rem",
          } as React.CSSProperties
        }
      >
        <ClientSidebar user={user} variant="inset" />
        <SidebarInset className="min-w-0 overflow-hidden flex flex-col">
          {/* Top bar */}
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-6"></header>

          <main className="flex-1 w-full overflow-x-hidden">{children}</main>
        </SidebarInset>
      </SidebarProvider>
      <Toaster richColors position="top-right" />
    </AuthProvider>
  );
}
