import { toTrainingDateRange, toMatchDateRange } from './attendance-report-date.util';

describe('attendance-report-date.util', () => {
  describe('toTrainingDateRange', () => {
    it('returns empty range when no bounds given', () => {
      expect(toTrainingDateRange()).toEqual({});
    });

    it('passes fromDate/toDate through as plain strings', () => {
      expect(toTrainingDateRange('2026-03-01', '2026-03-31')).toEqual({
        $gte: '2026-03-01',
        $lte: '2026-03-31',
      });
    });

    it('supports an open-ended range', () => {
      expect(toTrainingDateRange('2026-03-01')).toEqual({ $gte: '2026-03-01' });
      expect(toTrainingDateRange(undefined, '2026-03-31')).toEqual({ $lte: '2026-03-31' });
    });
  });

  describe('toMatchDateRange', () => {
    it('returns empty range when no bounds given', () => {
      expect(toMatchDateRange()).toEqual({});
    });

    it('anchors fromDate to the start of the Argentina day (UTC-3), not UTC midnight', () => {
      const range = toMatchDateRange('2026-03-07', undefined);
      expect(range['$gte']?.toISOString()).toBe('2026-03-07T03:00:00.000Z');
    });

    it('anchors toDate to the end of the Argentina day (UTC-3), including matches played that day', () => {
      const range = toMatchDateRange(undefined, '2026-03-07');
      expect(range['$lte']?.toISOString()).toBe('2026-03-08T02:59:59.999Z');
    });

    it('a match at 20:00 Argentina time on toDate falls within the range', () => {
      const range = toMatchDateRange(undefined, '2026-03-07');
      const matchInstant = new Date('2026-03-07T23:00:00.000Z'); // 20:00 Argentina
      expect(matchInstant.getTime()).toBeLessThanOrEqual(range['$lte']!.getTime());
    });
  });
});
