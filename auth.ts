import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";

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
      },
      async authorize(credentials) {
        console.error("[Auth] authorize() called, keys:", credentials ? Object.keys(credentials) : "null");
        const raw = (credentials ?? {}) as Record<string, unknown>;
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
        if (!email || !password) {
          if (process.env.NODE_ENV === "development") {
            console.error("[Auth] Login failed: missing email or password", { hasEmail: !!email, hasPassword: !!password });
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
          const ok = await compare(password, user.passwordHash);
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
      if (path.startsWith("/reset-password")) return true;
      if (path.startsWith("/api/auth")) return true;
      // API routes: let middleware return 401 when unauthenticated
      if (path.startsWith("/api/")) return true;
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
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
