import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const unreadNotifications = await prisma.notification.count({ where: { storeId: session.storeId, readAt: null } });
  return <AppShell user={session.user} store={session.store} unreadNotifications={unreadNotifications}>{children}</AppShell>;
}
