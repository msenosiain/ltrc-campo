import { toTrainingDateRange } from './attendance-report-date.util';

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
});
