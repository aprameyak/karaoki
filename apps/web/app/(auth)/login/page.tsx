import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { safeNext } from "@/lib/auth-utils";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Log in",
  description: "Log in to your Karaoki studio.",
  path: "/login",
  noindex: true,
});

const NOTICES: Record<string, string> = {
  confirm_failed: "That link is invalid or has expired. Request a new one and try again.",
  oauth_failed: "We could not complete the sign in. Please try again.",
  deleted: "Your account and files were deleted.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to your karaoke studio."
      footer={
        <>
          New to Karaoki?{" "}
          <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm next={next} notice={params.error ? NOTICES[params.error] : undefined} />
    </AuthCard>
  );
}
