import type { Metadata } from "next";
import { GlassHeader } from "@/components/glass-header";

export const metadata: Metadata = {
  title: "Privacy policy — AI Study Coach",
};

/**
 * Public privacy policy (T-01c scope; restyled in T-04a). No sign-in
 * required and no session read — the Google consent screen's Branding
 * page links here, so this route must always render, signed in or not,
 * and stay part of the static shell (no `cookies()`/`headers()`, so no
 * Suspense boundary needed).
 *
 * Shares `<GlassHeader />` with the `(auth)` screens (Figma node 98:8440)
 * rather than that route group's `layout.tsx`, because this route sits
 * outside `(auth)` — see `src/components/glass-header.tsx`.
 *
 * Content reflects the T-01c plan issue's wording, confirmed by Arya
 * (2026-11-06/07): this is a capstone demo deployment, not a commercial
 * product, and uploaded materials are expected to be sample/test content.
 * Update this page whenever a later task changes what the app collects,
 * who can see it, or how long it is kept.
 */
export default function PrivacyPolicyPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <GlassHeader />
      <main className="flex flex-1 justify-center px-4 py-10 sm:px-6">
        <article className="flex w-full max-w-2xl flex-col gap-6 text-sm leading-[1.375rem] text-foreground">
          <h1 className="text-[1.875rem] leading-[2.375rem] font-semibold text-foreground">
            Privacy policy
          </h1>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">About this app</h2>
            <p>
              AI Study Coach is a student capstone project for NIT3004 IT Capstone 2 at
              Victoria University. It is a working prototype that is online so it can be
              tested, evaluated and demonstrated in class. It is not a commercial product
              or a business and is not intended for general public use. It may change, be
              reset or be shut down at any time.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">
              Please upload sample materials only
            </h2>
            <p>
              Use practice or sample study materials, such as notes you wrote yourself or
              materials you have permission to use. Do not upload anything personal,
              confidential or sensitive.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">What we collect</h2>
            <p>
              Your name, email address and profile picture from your Google account; the
              study materials you upload; your quiz, flashcard and revision results; and
              your time zone (so &ldquo;due today&rdquo; matches your day).
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">Why</h2>
            <p>
              Only to run the study coach features for you. We do not sell your data, use
              it for advertising, or share it with anyone outside the services listed
              below.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">Services we use</h2>
            <p>
              Google (sign-in and the Gemini AI), Neon (database), Vercel (hosting and
              private file storage) and Upstash (background processing).
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">
              How the AI works with your materials
            </h2>
            <p>
              Parts of your uploaded materials are sent to Google&apos;s Gemini AI to
              suggest topics and create quizzes and flashcards. This project uses
              Gemini&apos;s free tier. Under Google&apos;s terms for free (&ldquo;Unpaid&rdquo;)
              use, Google may use the content it receives to improve its products, and
              human reviewers may read, annotate and process it. This is another reason
              to upload sample materials only.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">
              Who can see your data
            </h2>
            <p>
              Only you, in the app. The four-person project team can access the database
              to run and fix the app. If you report a problem with an AI-generated
              question, that report is kept and used to evaluate the AI&apos;s quality for
              the project.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">
              Deleting your data
            </h2>
            <p>
              Email us and we will delete your account and materials. A Delete account
              button is planned. When this capstone project is finished — after final
              marks for it are released — every account and uploaded material will be
              deleted.
            </p>
            <p>
              Deleting a Study Space removes it from your account straight away. Its
              stored records stay in our database until a later clean-up permanently
              clears them.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">Contact</h2>
            <p>
              Arya, project lead:{" "}
              <a href="mailto:s8189084@live.vu.edu.au" className="font-medium text-primary underline underline-offset-2">
                s8189084@live.vu.edu.au
              </a>
            </p>
          </section>

          <p className="text-xs leading-[1.125rem] text-muted-foreground">
            Last updated: 11 November 2026
          </p>
        </article>
      </main>
    </div>
  );
}
