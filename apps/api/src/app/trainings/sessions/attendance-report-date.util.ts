/**
 * TrainingSession.date is a plain 'YYYY-MM-DD' string; Match.date is a real
 * Mongoose Date. This is the single place that knows both shapes, so callers
 * only ever deal with a logical {fromDate, toDate} range.
 */

export function toTrainingDateRange(fromDate?: string, toDate?: string): Record<string, string> {
  const range: Record<string, string> = {};
  if (fromDate) range['$gte'] = fromDate;
  if (toDate) range['$lte'] = toDate;
  return range;
}

// Anchored to Argentina (UTC-3) day boundaries — a bare new Date(fromDate/toDate)
// parses as UTC midnight, which is 21:00 the previous day in Argentina and would
// silently exclude matches played on `toDate` itself.
export function toMatchDateRange(fromDate?: string, toDate?: string): Record<string, Date> {
  const range: Record<string, Date> = {};
  if (fromDate) range['$gte'] = new Date(`${fromDate}T00:00:00-03:00`);
  if (toDate) range['$lte'] = new Date(`${toDate}T23:59:59.999-03:00`);
  return range;
}
