/** "1 quiz", "2 quizzes": the count with the singular or plural noun. */
export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
