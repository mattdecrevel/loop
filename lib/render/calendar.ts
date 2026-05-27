function compact(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export interface CalInput { title: string; startIso: string; endIso?: string; details?: string; location?: string }

export function googleCalendarUrl(i: CalInput): string {
  const start = compact(i.startIso);
  const end = compact(i.endIso ?? new Date(new Date(i.startIso).getTime() + 30 * 60000).toISOString());
  const p = new URLSearchParams({ action: 'TEMPLATE', text: i.title, dates: `${start}/${end}` });
  if (i.details) p.set('details', i.details);
  if (i.location) p.set('location', i.location);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
