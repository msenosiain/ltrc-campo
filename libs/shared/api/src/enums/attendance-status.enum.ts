export enum AttendanceStatusEnum {
  PRESENT = 'present',
  ABSENT = 'absent',
  JUSTIFIED = 'justified',
  // Player belongs to a sibling match on the same date/sport/category (split-group
  // fixtures) and is not expected here — excluded from totals/reports.
  OTHER_MATCH = 'other_match',
}
