// Helpers for working with custom-field values, which may be strings, numbers,
// string arrays (multiselect), or — for date fields after a Firestore round
// trip — a Firebase Timestamp object rather than a JS Date.

// A required custom field is only satisfied by a real value. A plain truthiness
// check wrongly rejects 0 / false and accepts an empty multiselect array, so use
// a type-aware emptiness test.
export const isCustomFieldValueMissing = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

// Normalize a date value to a JS Date. Firestore returns dates as Timestamp
// objects (which expose toDate()); a freshly entered value is a JS Date. Returns
// null for anything that isn't a date.
export const toJsDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
};

// Format a custom-field value for display: dates as YYYY-MM-DD, multiselect
// arrays joined, everything else stringified. Returns '' for missing values.
export const formatCustomFieldValue = (value: unknown): string => {
  if (isCustomFieldValueMissing(value)) return '';
  const asDate = toJsDate(value);
  if (asDate) return asDate.toISOString().split('T')[0] || '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
};
