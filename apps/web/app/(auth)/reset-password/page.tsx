import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetForm } from "@/components/auth/reset-form";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/lib/supabase/server";

export const metadata = pageMetadata({
  title: "Set a new password",
  description: "Choose a new Karaoki password.",
  path: "/reset-password",
  noindex: true,
});

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?error=confirm_failed");
  return (
    <AuthCard title="Set a new password" subtitle="Choose a password you have not used before.">
      <ResetForm />
    </AuthCard>
  );
}
