import "next-auth";

declare module "next-auth/jwt" {
  interface JWT {
    picture?: string;
    id?: string;
    /** Unix ms when owner passed the secondary admin password. */
    adminVerifiedAt?: number;
  }
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string | null;
      name?: string | null;
      image?: string | null;
      adminVerifiedAt?: number;
    };
    /** Passed to `session.update()` after admin password verification. */
    adminVerified?: boolean;
  }
}
