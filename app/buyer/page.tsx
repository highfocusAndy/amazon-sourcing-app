import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { BuyerCatalog } from "./BuyerCatalog";

export const metadata = {
  title: "Browse Amazon — HIGH FOCUS Buyer",
  description: "Browse Amazon products by category, price, and rating.",
};

export default async function BuyerPage() {
  const session = await auth();
  let userMode: string | null = null;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { userMode: true },
    });
    userMode = user?.userMode ?? null;
  }
  return <BuyerCatalog userMode={userMode} />;
}
