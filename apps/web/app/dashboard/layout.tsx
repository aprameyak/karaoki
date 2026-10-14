import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { MobileNav, SidebarNav } from "@/components/dashboard/nav";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s | Karaoki" },
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email, is_admin")
    .eq("id", data.user.id)
    .maybeSingle();

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-line/60 p-5 md:flex">
        <div className="space-y-8">
          <Logo href="/dashboard" />
          <SidebarNav isAdmin={Boolean(profile?.is_admin)} />
        </div>
        <div className="space-y-3">
          <div className="px-2 text-sm">
            <p className="truncate font-medium">{profile?.display_name ?? "Your account"}</p>
            <p className="truncate text-xs text-muted">{profile?.email ?? data.user.email}</p>
          </div>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline" size="sm" className="w-full">
              Log out
            </Button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex h-16 items-center justify-between border-b border-line/60 px-5 md:hidden">
          <Logo href="/dashboard" />
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="sm">
              Log out
            </Button>
          </form>
        </header>
        <main id="main" className="px-5 pb-28 pt-8 md:px-10 md:pb-16">
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
