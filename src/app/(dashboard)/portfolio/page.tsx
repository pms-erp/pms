// src/app/(dashboard)/portfolio/page.tsx
// Server Component — handles RBAC redirect before anything renders

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import PortfolioClient from "./_components/portfolio-client";

export const metadata = {
  title: "Portfolio | Taiba Digital PMS",
};

export default async function PortfolioPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) redirect("/login");

  const role = session.user.role;

  // Only ADMIN and PROJECT_MANAGER allowed
  if (role !== "ADMIN" && role !== "PROJECT_MANAGER") {
    redirect("/");
  }

  return <PortfolioClient />;
}
