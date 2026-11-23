/**
 * "Mistakes to review" (`.count-bars` in the redesign prototype): open
 * mistakes per Study Space, most first, as plain bars in the neutral chart
 * colour. It's a count of questions to revisit, never a score. The drawing is
 * hidden from screen readers; the table has the same numbers.
 */
export function AnalyticsMistakesChart({ spaces }: { spaces: ReadonlyArray<{ spaceId: string; name: string; mistakes: number }> }) {
  const ranked = [...spaces].sort((a, b) => b.mistakes - a.mistakes);
  const most = ranked[0]?.mistakes ?? 0;
  if (most === 0) {
    return <p className="text-sm text-muted-foreground">No mistakes to review in any Study Space.</p>;
  }

  return (
    <>
      <ul aria-hidden="true" className="flex flex-col gap-2">
        {ranked.map((space) => (
          <li
            key={space.spaceId}
            className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_1.5rem] items-center gap-2 text-sm sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)_2rem] sm:gap-4"
          >
            <span className="break-words">{space.name}</span>
            <span className="h-4">
              {space.mistakes > 0 && (
                <span className="block h-full bg-chart-1" style={{ width: `${(space.mistakes / most) * 100}%` }} />
              )}
            </span>
            <span className="text-right font-semibold tabular-nums">{space.mistakes}</span>
          </li>
        ))}
      </ul>
      <div className="sr-only">
        <table>
          <caption>Mistakes to review in each Study Space</caption>
          <thead>
            <tr>
              <th scope="col">Study Space</th>
              <th scope="col">Mistakes to review</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((space) => (
              <tr key={space.spaceId}>
                <th scope="row">{space.name}</th>
                <td>{space.mistakes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
