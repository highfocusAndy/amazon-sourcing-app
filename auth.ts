import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";
import { hashPasskeyLoginSecret } from "@/lib/passkeyLoginToken";

const authSecret =
  process.env.AUTH_SECRET ??
  (process.env.NODE_ENV === "development" ? "dev-secret-replace-with-npx-auth-secret" : undefined);

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        passkeyToken: { label: "Passkey session", type: "text" },
      },
      async authorize(credentials) {
        const raw = (credentials ?? {}) as Record<string, unknown>;
        const passkeyTokenRaw = typeof raw.passkeyToken === "string" ? raw.passkeyToken.trim() : "";
        if (passkeyTokenRaw) {
          try {
            const hash = hashPasskeyLoginSecret(passkeyTokenRaw);
            const row = await prisma.passkeyLoginToken.findUnique({ where: { tokenHash: hash } });
            if (!row || row.expiresAt < new Date()) return null;
            await prisma.passkeyLoginToken.delete({ where: { id: row.id } });
            const user = await prisma.user.findUnique({ where: { id: row.userId } });
            if (!user) return null;
            return { id: user.id, email: user.email, name: user.name ?? undefined };
          } catch {
            return null;
          }
        }

        let email = typeof raw.email === "string" ? raw.email : (Array.isArray(raw.email) ? raw.email[0] : undefined);
        let password = typeof raw.password === "string" ? raw.password : (Array.isArray(raw.password) ? raw.password[0] : undefined);
        email = (email != null ? String(email) : "").trim();
        password = password != null ? String(password) : "";
        if (!email || !password) {
          const anyKey = (k: string) =>
            typeof raw[k] === "string" ? (raw[k] as string) : "";
          if (!email) email = anyKey("Email") || anyKey("email").trim();
          if (!password) password = anyKey("Password") || anyKey("password");
          email = email.trim().toLowerCase();
        } else {
          email = email.trim().toLowerCase();
        }
        const passwordForCompare = password.trim();
        if (!email || !passwordForCompare) {
          if (process.env.NODE_ENV === "development") {
            console.error("[Auth] Login failed: missing email or password", { hasEmail: !!email, hasPassword: !!passwordForCompare });
          }
          return null;
        }
        try {
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user) {
            if (process.env.NODE_ENV === "development") {
              console.error("[Auth] Login failed: user not found for email", email);
            }
            return null;
          }
          // Match trimmed password (same as LoginForm). Also try raw input for accounts created before trim-on-register.
          let ok = await compare(passwordForCompare, user.passwordHash);
          if (!ok && password !== passwordForCompare) {
            ok = await compare(password, user.passwordHash);
          }
          if (!ok) {
            if (process.env.NODE_ENV === "development") {
              console.error("[Auth] Login failed: wrong password for email", email);
            }
            return null;
          }
          return { id: user.id, email: user.email, name: user.name ?? undefined };
        } catch (err) {
          if (process.env.NODE_ENV === "development") {
            console.error("[Auth] Login error (DB or compare):", err);
          }
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const path = nextUrl.pathname;
      if (path.startsWith("/login")) return true;
      if (path.startsWith("/signup")) return true;
      if (path.startsWith("/get-access")) return true;
      if (path.startsWith("/reset-password")) return true;
      if (path.startsWith("/api/auth")) return true;
      // API routes: let middleware return 401 when unauthenticated
      if (path.startsWith("/api/")) return true;
      return !!auth?.user;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      // Keep token.id aligned with the DB row for this email (fixes stale JWT after DB restore / user id change).
      const em = typeof token.email === "string" ? token.email.trim().toLowerCase() : "";
      // Avoid Prisma on the Edge runtime (middleware); Node RSC / API routes will resync the id.
      if (em && process.env.NEXT_RUNTIME !== "edge") {
        try {
          const row = await prisma.user.findUnique({ where: { email: em }, select: { id: true } });
          if (row) token.id = row.id;
        } catch {
          /* leave token as-is */
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string | null;
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
  trustHost: true,
});
