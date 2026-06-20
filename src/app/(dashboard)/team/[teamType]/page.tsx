// app/(dashboard)/team/[teamType]/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { TeamDetail } from "./team-detail";

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ teamType: string }>;
}) {
  const { teamType } = await params;
  const slug = teamType.toUpperCase();

  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "PROJECT_MANAGER"].includes(session.user.role)) {
    redirect("/");
  }

  // Validate against DB — no more hardcoded TeamType enum
  const team = await db
    .select()
    .from(teams)
    .where(eq(teams.slug, slug))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!team) {
    redirect("/team");
  }

  // Fetch team member data via internal API
  const cookieStore = await cookies();
  const cookieStr = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  const res = await fetch(`${appUrl}/api/teams/${slug}`, {
    cache: "no-store",
    headers: { cookie: cookieStr },
  });

  if (!res.ok) {
    redirect("/team");
  }

  const teamData = await res.json();

  return <TeamDetail team={teamData} teamType={slug} />;
}
