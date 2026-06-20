// components/site-header.tsx
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ProjectSearch } from "@/app/(dashboard)/projects/[id]/_components/project-search";
import { Suspense } from "react";

export function SiteHeader() {
  return (
    <header className="flex h-12 shrink-0 items-center border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-20">
      <div className="flex w-full items-center gap-2 px-3 lg:px-4">
        {/* ── Left: sidebar trigger ── */}
        <div className="flex items-center gap-2 shrink-0">
          <SidebarTrigger className="-ml-1 h-8 w-8" />
          <Separator orientation="vertical" className="h-4" />
        </div>
        {/* ── Center: search (grows to fill space) ── */}
        <div className="flex-1 flex justify-center max-w-xl mx-auto md:pb-2">
          <Suspense fallback={null}>
            <ProjectSearch />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
