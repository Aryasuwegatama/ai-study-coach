"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ActivityResponse } from "@/features/progress/progress-schemas";
import { cn } from "@/lib/class-names";

type Tab = "activity" | "quizzes" | "flashcards";
const TABS: { id: Tab; label: string }[] = [
  { id: "activity", label: "Activity" },
  { id: "quizzes", label: "Quiz results" },
  { id: "flashcards", label: "Flashcards" },
];

/** "17 Nov" for a `YYYY-MM-DD` week start (a calendar date, so formatted in UTC). */
function weekLabel(day: string): string {
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

/** "21 Nov" for a moment, in the student's own time zone. */
function shortDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone }).format(new Date(iso));
}

const pct = (value: number, max: number) => (max > 0 ? `${(value / max) * 100}%` : "0%");

/** The plot area every chart shares: room above for value labels, and a baseline. */
function Plot({ children }: { children: ReactNode }) {
  return <div className="flex h-40 items-end gap-1.5 border-b border-border-strong pt-6 sm:gap-2">{children}</div>;
}

/**
 * The x-axis labels under a `Plot`, one slot per column so they line up. With
 * more than 6 columns only the first and last are labelled (the sr-only table
 * has every date); otherwise every other label hides on a phone. Labels never
 * collide or get cut off.
 */
function XLabels({ labels, sparse = false }: { labels: string[]; sparse?: boolean }) {
  const ends = sparse && labels.length > 6;
  return (
    <div className="flex gap-1.5 sm:gap-2">
      {labels.map((label, i) => {
        const edge = i === 0 || i === labels.length - 1;
        return (
          <span
            key={`${label}-${i}`}
            className={cn(
              "min-w-0 flex-1 text-center text-xs whitespace-nowrap text-muted-foreground",
              ends ? (!edge && "invisible") : cn("truncate", i % 2 === 1 && "max-sm:invisible"),
              ends && i === 0 && "text-left",
              ends && i === labels.length - 1 && "text-right",
            )}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

/** One bar with its value printed above it (nothing for a zero). */
function Bar({ value, max, className, title }: { value: number; max: number; className: string; title?: string }) {
  return (
    <div className="relative flex h-full w-full max-w-5 flex-col justify-end" title={title}>
      {value > 0 && (
        <div className={cn("relative rounded-t-[4px]", className)} style={{ height: pct(value, max) }}>
          <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-semibold text-foreground tabular-nums">{value}</span>
        </div>
      )}
    </div>
  );
}

function Legend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <ul aria-hidden="true" className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-2">
          <span className={cn("size-3 shrink-0 rounded-[3px]", item.className)} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function ActivityPanel({ weeks }: { weeks: ActivityResponse["weeks"] }) {
  const quizzes = weeks.reduce((sum, w) => sum + w.quizzes, 0);
  const sessions = weeks.reduce((sum, w) => sum + w.flashcardSessions, 0);
  const cards = weeks.reduce((sum, w) => sum + w.cardsRated, 0);
  if (quizzes + sessions === 0) return <Empty>Nothing in the last {weeks.length} weeks yet. Submit a quiz or finish a flashcard practice and it shows here.</Empty>;
  const max = Math.max(...weeks.map((w) => Math.max(w.quizzes, w.flashcardSessions)));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{quizzes}</span> quiz{quizzes === 1 ? "" : "zes"} submitted ·{" "}
        <span className="font-semibold text-foreground">{sessions}</span> flashcard session{sessions === 1 ? "" : "s"} finished
        {cards > 0 && ` (${cards} cards rated)`}
      </p>
      <Legend
        items={[
          { label: "Quizzes submitted", className: "bg-chart-1" },
          { label: "Flashcard sessions finished", className: "bg-chart-4" },
        ]}
      />
      <div aria-hidden="true" className="flex flex-col gap-1">
        <Plot>
          {weeks.map((w) => (
            <div key={w.weekStart} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5">
              <Bar value={w.quizzes} max={max} className="bg-chart-1" />
              <Bar value={w.flashcardSessions} max={max} className="bg-chart-4" />
            </div>
          ))}
        </Plot>
        <XLabels labels={weeks.map((w) => weekLabel(w.weekStart))} />
      </div>
      <p className="text-xs text-muted-foreground">Each pair of bars is one week, starting Monday.</p>
      <SrTable
        caption="Your activity by week"
        head={["Week of", "Quizzes submitted", "Flashcard sessions finished", "Cards rated"]}
        rows={weeks.map((w) => [weekLabel(w.weekStart), w.quizzes, w.flashcardSessions, w.cardsRated])}
      />
    </div>
  );
}

function QuizzesPanel({ attempts, timeZone, showSpace }: { attempts: ActivityResponse["quizAttempts"]; timeZone: string; showSpace: boolean }) {
  if (attempts.length === 0) return <Empty>No quizzes submitted yet. Your scores show here, one bar per attempt.</Empty>;
  const latest = attempts[attempts.length - 1];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Your latest {attempts.length === 1 ? "quiz attempt" : `${attempts.length} quiz attempts`}, oldest to newest. Each bar is one attempt&apos;s
        score. This isn&apos;t your topic mastery.
      </p>
      <div aria-hidden="true" className="flex flex-col gap-1">
        <Plot>
          {attempts.map((a) => (
            <div key={a.attemptId} className="flex h-full min-w-0 flex-1 justify-center">
              <div className="relative flex h-full w-full max-w-8 flex-col justify-end" title={`${a.title} · ${a.score} of ${a.total}`}>
                <div className="relative rounded-t-[4px] bg-chart-1" style={{ height: `${Math.max(a.percent, 1)}%` }}>
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-semibold text-foreground tabular-nums">{a.percent}%</span>
                </div>
              </div>
            </div>
          ))}
        </Plot>
        <XLabels sparse labels={attempts.map((a) => shortDate(a.submittedAt, timeZone))} />
      </div>
      <p className="text-sm break-words text-muted-foreground">
        Latest: <span className="font-semibold text-foreground">{latest.title}</span>
        {showSpace && ` (${latest.spaceName})`} · {latest.score} of {latest.total} ({latest.percent}%)
      </p>
      <SrTable
        caption="Your latest quiz attempts, oldest first"
        head={["Quiz", "Study Space", "Submitted", "Score"]}
        rows={attempts.map((a) => [a.title, a.spaceName, shortDate(a.submittedAt, timeZone), `${a.score} of ${a.total} (${a.percent}%)`])}
      />
    </div>
  );
}

function FlashcardsPanel({ sessions, timeZone, showSpace }: { sessions: ActivityResponse["deckSessions"]; timeZone: string; showSpace: boolean }) {
  if (sessions.length === 0) return <Empty>No flashcard practice finished yet. Each finished session shows here with how you rated your cards.</Empty>;
  const max = Math.max(...sessions.map((s) => s.gotIt + s.again));
  const latest = sessions[sessions.length - 1];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Your latest {sessions.length === 1 ? "practice session" : `${sessions.length} practice sessions`}, oldest to newest. Ratings are just for you.
      </p>
      <Legend
        items={[
          { label: "Got it", className: "bg-green" },
          { label: "Again", className: "bg-chart-3" },
        ]}
      />
      <div aria-hidden="true" className="flex flex-col gap-1">
        <Plot>
          {sessions.map((s) => {
            const total = s.gotIt + s.again;
            return (
              <div key={s.sessionId} className="flex h-full min-w-0 flex-1 justify-center">
                <div className="relative flex h-full w-full max-w-8 flex-col justify-end" title={`${s.title} · Got it ${s.gotIt} · Again ${s.again}`}>
                  <div className="relative flex flex-col gap-0.5" style={{ height: pct(total, max) }}>
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-semibold text-foreground tabular-nums">{total}</span>
                    {s.again > 0 && <div className="rounded-t-[4px] bg-chart-3" style={{ flexGrow: s.again }} />}
                    {s.gotIt > 0 && <div className={cn("bg-green", s.again === 0 && "rounded-t-[4px]")} style={{ flexGrow: s.gotIt }} />}
                  </div>
                </div>
              </div>
            );
          })}
        </Plot>
        <XLabels sparse labels={sessions.map((s) => shortDate(s.finishedAt, timeZone))} />
      </div>
      <p className="text-sm break-words text-muted-foreground">
        Latest: <span className="font-semibold text-foreground">{latest.title}</span>
        {showSpace && ` (${latest.spaceName})`} · Got it {latest.gotIt} · Again {latest.again}
      </p>
      <SrTable
        caption="Your latest finished flashcard practice sessions, oldest first"
        head={["Deck", "Study Space", "Finished", "Got it", "Again"]}
        rows={sessions.map((s) => [s.title, s.spaceName, shortDate(s.finishedAt, timeZone), s.gotIt, s.again])}
      />
    </div>
  );
}

/**
 * "Your activity" (UI redesign, Arya, 2026-11-23): one compact card with three
 * tabs, so Analytics doesn't fill up with charts. Activity counts quizzes and
 * practice sessions per week; Quiz results shows each attempt's own score;
 * Flashcards shows each finished session's Got it / Again split. Never an
 * average, an overall score, a streak or a goal. Every chart prints its
 * numbers and has an sr-only table with the same values.
 */
export function AnalyticsActivityCard({
  activity,
  timeZone,
  scope,
  headingLevel = "h2",
}: {
  activity: ActivityResponse;
  timeZone: string;
  /** "all": across every Study Space (shows space names); "space": one space. */
  scope: "all" | "space";
  headingLevel?: "h2" | "h3";
}) {
  const [tab, setTab] = useState<Tab>("activity");
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ activity: null, quizzes: null, flashcards: null });
  const Heading = headingLevel;
  const nothingYet = activity.quizAttempts.length === 0 && activity.deckSessions.length === 0;

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((t) => t.id === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  }

  return (
    <Card className="gap-4 p-6 max-sm:p-4">
      <div>
        <Heading className="text-card-title text-foreground">Your activity</Heading>
        <p className="mt-1 text-sm text-muted-foreground">
          {scope === "space" ? "Quizzes and flashcards in this space." : "Quizzes and flashcards across your Study Spaces."}
        </p>
      </div>

      {nothingYet ? (
        <div className="flex items-start gap-3 rounded-lg bg-secondary p-4">
          <Activity className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm text-secondary-foreground">Your activity shows here after you submit a quiz or finish a flashcard practice.</p>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Activity views" className="flex gap-1 rounded-lg bg-secondary p-1">
            {TABS.map((t) => {
              const selected = tab === t.id;
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[t.id] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`activity-tab-${t.id}`}
                  aria-selected={selected}
                  aria-controls={`activity-panel-${t.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  onKeyDown={onTabKey}
                  className={cn(
                    "min-h-11 flex-1 cursor-pointer rounded-md px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    selected ? "bg-card font-semibold text-foreground shadow-sm" : "font-medium text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          {TABS.map((t) => (
            <div
              key={t.id}
              role="tabpanel"
              id={`activity-panel-${t.id}`}
              aria-labelledby={`activity-tab-${t.id}`}
              hidden={tab !== t.id}
              tabIndex={0}
              className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {t.id === "activity" && <ActivityPanel weeks={activity.weeks} />}
              {t.id === "quizzes" && <QuizzesPanel attempts={activity.quizAttempts} timeZone={timeZone} showSpace={scope === "all"} />}
              {t.id === "flashcards" && <FlashcardsPanel sessions={activity.deckSessions} timeZone={timeZone} showSpace={scope === "all"} />}
            </div>
          ))}
        </>
      )}
    </Card>
  );
}
