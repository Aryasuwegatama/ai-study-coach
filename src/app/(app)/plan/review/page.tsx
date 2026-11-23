import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ApiError } from "@/lib/api-errors";
import { getCurrentUser } from "@/server/auth/auth-session";
import { requireSpace } from "@/server/auth/auth-space-access";
import { requireTopic } from "@/features/topics/server";
import { mistakesQuerySchema } from "@/features/revision/revision-schemas";
import { ReviewMistakesPageClient } from "@/features/plan/components/review-mistakes-page-client";
import { PageContainer } from "@/components/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Review mistakes — AI Study Coach",
};

type ReviewPageProps = { searchParams: Promise<{ topicId?: string | string[]; spaceId?: string | string[] }> };

/** Review mistakes (T-15): `?topicId=` or `?spaceId=`. */
export default function ReviewMistakesPage({ searchParams }: ReviewPageProps) {
  return (
    <PageContainer>
      <Suspense fallback={<Skeleton className="mx-auto h-64 w-full max-w-[48rem] rounded-xl" />}>
        <ReviewMistakesContent searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

const isCode = (error: unknown, code: string) => error instanceof ApiError && error.code === code;
const single = (value: string | string[] | undefined) => (Array.isArray(value) ? "" : value);

/**
 * The session check, then ownership of the topic or Study Space on the
 * server, before anything renders: a foreign or malformed id is "not found",
 * never an empty session.
 */
async function ReviewMistakesContent({ searchParams }: ReviewPageProps) {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const raw = await searchParams;
  const parsed = mistakesQuerySchema.safeParse({ topicId: single(raw.topicId), spaceId: single(raw.spaceId) });
  if (!parsed.success) {
    notFound();
  }

  if (parsed.data.topicId) {
    const topic = await requireTopic(parsed.data.topicId, user).catch((error: unknown) => {
      if (isCode(error, "TOPIC_NOT_FOUND")) return null;
      throw error;
    });
    if (!topic) {
      notFound();
    }
    // The topic is the student's, so its space is too; it only names it in the header.
    const topicSpace = await requireSpace(topic.spaceId, user).catch((error: unknown) => {
      if (isCode(error, "SPACE_NOT_FOUND")) return null;
      throw error;
    });
    if (!topicSpace) {
      notFound();
    }
    return (
      <ReviewMistakesPageClient
        key={topic.id}
        scope={{ topicId: topic.id }}
        scopeName={topic.name}
        contextName={topicSpace.name}
        exitHref={`/spaces/${topic.spaceId}/analytics/topics/${topic.id}`}
      />
    );
  }

  const space = await requireSpace(parsed.data.spaceId!, user).catch((error: unknown) => {
    if (isCode(error, "SPACE_NOT_FOUND")) return null;
    throw error;
  });
  if (!space) {
    notFound();
  }
  return <ReviewMistakesPageClient key={space.id} scope={{ spaceId: space.id }} scopeName={space.name} exitHref={`/spaces/${space.id}/analytics`} />;
}
