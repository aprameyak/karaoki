import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/marketing/json-ld";
import { POSTS, formatPostDate, getPost } from "@/lib/blog";
import { siteUrl } from "@/lib/env";
import { pageMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = getPost((await params).slug);
  if (!post) return {};
  return {
    ...pageMetadata({ title: post.title, description: post.description, path: `/blog/${post.slug}` }),
    openGraph: {
      title: post.title,
      description: post.description,
      url: `${siteUrl()}/blog/${post.slug}`,
      type: "article",
      publishedTime: post.date,
      siteName: "Karaoki",
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = getPost((await params).slug);
  if (!post) notFound();
  const url = `${siteUrl()}/blog/${post.slug}`;

  return (
    <article className="mx-auto max-w-3xl px-5 pb-10 pt-16">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: post.title,
          description: post.description,
          datePublished: post.date,
          dateModified: post.date,
          mainEntityOfPage: url,
          author: { "@type": "Organization", name: "Karaoki" },
          publisher: { "@type": "Organization", name: "Karaoki" },
        }}
      />
      <Link href="/blog" className="text-sm text-muted hover:text-ink">
        All articles
      </Link>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">{post.title}</h1>
      <p className="mt-3 text-sm text-muted">
        <time dateTime={post.date}>{formatPostDate(post.date)}</time> · {post.minutes} min read
      </p>
      <div className="mt-10 space-y-5 leading-relaxed text-muted">
        {post.body.map((block, index) => {
          if (block.type === "h2") {
            return (
              <h2 key={index} className="pt-4 text-2xl font-semibold text-ink">
                {block.text}
              </h2>
            );
          }
          if (block.type === "ul") {
            return (
              <ul key={index} className="list-disc space-y-2 pl-5">
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            );
          }
          return <p key={index}>{block.text}</p>;
        })}
      </div>
      <p className="mt-12 rounded-2xl border border-line bg-surface/60 p-5 text-sm">
        Ready to try it? <Link href="/signup" className="text-link hover:underline">Create a free Karaoki account</Link> and
        make your first karaoke track.
      </p>
    </article>
  );
}
