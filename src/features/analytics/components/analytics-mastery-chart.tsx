import type { TopicProgress } from "@/features/progress/progress-schemas";
import { STATUS_LABELS, masteryDetail } from "../analytics-format";
import { PERCENT_FILL } from "./analytics-status-bar";
import { TopicStatusLine } from "./mastery-pill";

const COLUMNS = "grid grid-cols-1 sm:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)] sm:gap-x-6";
/** The dashed 60% line, drawn in each bar cell so it lines up at any width. */
const REFERENCE_LINE =
  "after:absolute after:inset-y-0 after:left-[60%] after:border-l-2 after:border-dashed after:border-destructive";

function hasPercent(topic: TopicProgress): topic is TopicProgress & { status: "weak" | "on_track"; percent: number } {
  return topic.percent !== null && (topic.status === "weak" || topic.status === "on_track");
}

function Label({ topic }: { topic: TopicProgress }) {
  return (
    <div className="min-w-0 py-4 max-sm:pb-0">
      <p className="font-semibold break-words text-foreground">{topic.name}</p>
      <TopicStatusLine topic={topic} hasReadyMaterial={topic.hasReadyMaterial} />
    </div>
  );
}

/**
 * "Mastery by topic" (`.mastery-chart` in the redesign prototype): one bar per
 * topic that has a percentage, Weak first, against a dashed 60% line.
 * Topics with Not enough evidence or Not assessed are labelled rows with no
 * bar, never drawn as 0%. The drawing is hidden from screen readers; the
 * table below it has the same values.
 */
export function AnalyticsMasteryChart({ topics }: { topics: TopicProgress[] }) {
  const withPercent = topics.filter(hasPercent);
  const barred = [...withPercent.filter((t) => t.status === "weak"), ...withPercent.filter((t) => t.status === "on_track")];
  const plain = topics.filter((t) => !hasPercent(t));

  return (
    <>
      <div aria-hidden="true">
        {barred.length > 0 && (
          <>
            <div className={COLUMNS}>
              <span className="max-sm:hidden" />
              <div className="relative h-6 text-sm text-muted-foreground">
                <span className="absolute left-0">0%</span>
                <span className="absolute left-[60%] -translate-x-1/2 font-semibold whitespace-nowrap text-destructive">
                  Weak below 60%
                </span>
                <span className="absolute right-0">100%</span>
              </div>
            </div>
            <ul>
              {barred.map((topic) => (
                <li key={topic.topicId} className={`${COLUMNS} border-t border-border`}>
                  <Label topic={topic} />
                  <div className={`relative flex min-w-0 items-center py-4 max-sm:pt-2 ${REFERENCE_LINE}`}>
                    <div className="h-5 w-full bg-secondary">
                      <div className={`h-full ${PERCENT_FILL[topic.status]}`} style={{ width: `${topic.percent}%` }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {plain.length > 0 && (
          <>
            <p className={`pb-2 text-sm font-semibold text-muted-foreground ${barred.length > 0 ? "mt-6" : ""}`}>
              No percentage yet
            </p>
            <ul>
              {plain.map((topic) => (
                <li key={topic.topicId} className={`${COLUMNS} border-t border-border`}>
                  <Label topic={topic} />
                  <div className="flex min-w-0 items-center py-4 text-sm text-muted-foreground max-sm:pt-1">
                    {topic.status === "not_assessed" ? "No bar until this topic is tested" : "No bar until 5 questions are answered"}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="sr-only">
        <table>
          <caption>Mastery by topic</caption>
          <thead>
            <tr>
              <th scope="col">Topic</th>
              <th scope="col">Status</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {[...barred, ...plain].map((topic) => (
              <tr key={topic.topicId}>
                <th scope="row">{topic.name}</th>
                <td>
                  {STATUS_LABELS[topic.status]}
                  {!topic.hasReadyMaterial && ", no material"}
                </td>
                <td>
                  {masteryDetail(topic)}
                  {!hasPercent(topic) && " (no percentage yet)"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
