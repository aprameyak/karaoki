import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";
import { safeNext } from "@/lib/auth-utils";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Create your account",
  description: "Create a free Karaoki account and start making karaoke tracks.",
  path: "/signup",
  noindex: true,
});

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  return (
    <AuthCard
      title="Create your account"
      subtitle="Free to start. No credit card needed."
      footer={
        <>
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-link hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <SignupForm next={next} />
    </AuthCard>
  );
}
