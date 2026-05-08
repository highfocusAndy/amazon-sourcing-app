import "next-auth";

declare module "next-auth/jwt" {
  interface JWT {
    picture?: string;
    id?: string;
  }
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}
