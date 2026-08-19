export function isActualCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000-")) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function hasActualCalendarDate(value: string): boolean {
  return [...value.matchAll(/\d{4}-\d{2}-\d{2}/gu)]
    .map((match) => match[0])
    .some((date) => date !== undefined && isActualCalendarDate(date));
}
