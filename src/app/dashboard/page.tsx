import { DashboardView } from "@/components/dashboard/DashboardView";
import { getCurrentUser } from "@/lib/auth/session";
import { getCollectionsForUser } from "@/lib/collections/queries";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const { collections, error } = await getCollectionsForUser(user.id);

  return <DashboardView userEmail={user.email ?? null} collections={collections} collectionsError={error} />;
}
