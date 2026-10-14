import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "@/components/auth/forgot-form";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Reset your password",
  description: "Request a Karaoki password reset link.",
  path: "/forgot-password",
  noindex: true,
});

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter your email and we will send you a link to set a new one."
      footer={
        <Link href="/login" className="text-primary hover:underline">
          Back to log in
        </Link>
      }
    >
      <ForgotForm />
    </AuthCard>
  );
}
