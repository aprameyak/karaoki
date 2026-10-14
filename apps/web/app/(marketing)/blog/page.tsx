import Link from "next/link";
import { PageHeader } from "@/components/marketing/page-header";
import { POSTS, formatPostDate } from "@/lib/blog";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Blog",
  description:
    "Short, practical guides about karaoke, vocal removal, choosing a key and recording at home.",
  path: "/blog",
});

export default function BlogIndexPage() {
  return (
    <>
      <PageHeader title="Blog" intro="Short, practical guides for singing along at home." />
      <ul className="mx-auto max-w-3xl space-y-5 px-5 pb-10">
        {POSTS.map((post) => (
          <li key={post.slug}>
            <article className="rounded-3xl border border-line bg-surface/60 p-6">
              <p className="text-sm text-muted">
                <time dateTime={post.date}>{formatPostDate(post.date)}</time> · {post.minutes} min read
              </p>
              <h2 className="mt-2 text-xl font-semibold">
                <Link href={`/blog/${post.slug}`} className="hover:text-primary">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-2 text-muted">{post.description}</p>
            </article>
          </li>
        ))}
      </ul>
    </>
  );
}
