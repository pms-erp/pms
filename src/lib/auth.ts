// src/lib/auth.ts
import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials.password) {
          return null;
        }

        // ─── Hardcoded Attendance Manager ────────────────────────────────────
        // This user exists only in .env — no DB row needed.
        // They can only access /attendance (enforced in middleware).
        if (
          credentials.username === process.env.ATTENDANCE_MANAGER_USERNAME &&
          credentials.password === process.env.ATTENDANCE_MANAGER_PASSWORD
        ) {
          return {
            id: "attendance-manager",
            name: "Attendance Manager",
            email: credentials.username,
            role: "ATTENDANCE_MANAGER",
            team_type: null,
            team_leader_id: null,
            avatar: null,
          };
        }
        // ─────────────────────────────────────────────────────────────────────

        const result = await db
          .select()
          .from(users)
          .where(eq(users.username, credentials.username))
          .limit(1);

        if (!result.length) return null;

        const dbUser = result[0];

        if (!dbUser.is_active) return null;

        const isValid = await compare(credentials.password, dbUser.password);
        if (!isValid) return null;

        return {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.username,
          role: dbUser.role,
          team_type: dbUser.team_type ?? null,
          team_leader_id: dbUser.team_leader_id ?? null,
          avatar: dbUser.avatar ?? null,
        };
      },
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8,
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.team_type = user.team_type;
        token.team_leader_id = user.team_leader_id;
        token.avatar = user.avatar;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.team_type = token.team_type as string | null;
        session.user.team_leader_id = token.team_leader_id as string | null;
        session.user.avatar = token.avatar as string | null;
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },

  secret: process.env.NEXTAUTH_SECRET,
};
