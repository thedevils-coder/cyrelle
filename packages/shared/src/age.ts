/** Country-specific account age rule. Null means the country does not impose a minimum. */
export function registrationAgeDecision(input: {
  dateOfBirth?: string | null;
  minAccountAge?: number | null;
  now?: Date;
}): 'ok' | 'dob_required' | 'under_minimum' {
  if (input.minAccountAge == null) return 'ok';
  if (!input.dateOfBirth) return 'dob_required';
  const dob = new Date(input.dateOfBirth);
  if (Number.isNaN(dob.getTime())) return 'dob_required';
  const now = input.now ?? new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const month = now.getUTCMonth() - dob.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  if (age < input.minAccountAge) return 'under_minimum';
  return 'ok';
}
