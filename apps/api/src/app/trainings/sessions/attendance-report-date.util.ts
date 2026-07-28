/**
 * Both TrainingSession.date and Match.date are plain 'YYYY-MM-DD' strings,
 * so a logical {fromDate, toDate} range is just a direct string comparison.
 */

export function toTrainingDateRange(fromDate?: string, toDate?: string): Record<string, string> {
  const range: Record<string, string> = {};
  if (fromDate) range['$gte'] = fromDate;
  if (toDate) range['$lte'] = toDate;
  return range;
}
