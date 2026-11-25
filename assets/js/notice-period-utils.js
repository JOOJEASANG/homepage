// Notice publication is based on the shop's local calendar, not the visitor's timezone.
export function noticeDayKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(now);
  const part = type => parts.find(p => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isActiveNotice(data, today = noticeDayKey()) {
  const start = String(data?.publishStartDate || '').trim();
  const end = String(data?.publishEndDate || '').trim();
  return (!start || today >= start) && (!end || today <= end);
}
