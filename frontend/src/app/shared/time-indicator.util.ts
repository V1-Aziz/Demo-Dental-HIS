function diffMin(hour: number, minute: number, now: Date): number {
  const apptDate = new Date(now);
  apptDate.setHours(hour, minute, 0, 0);
  return Math.round((apptDate.getTime() - now.getTime()) / 60000);
}

export function apptRelativeTime(hour: number, minute: number, now: Date): string {
  const diff = diffMin(hour, minute, now);
  if (diff >= -5 && diff <= 5) return 'Now';
  if (diff > 5 && diff <= 30) return `In ${diff} min`;
  if (diff > 30) {
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return m > 0 ? `In ${h}h ${m}m` : `In ${h}h`;
  }
  const past = Math.abs(diff);
  if (past <= 60) return `${past} min ago`;
  return 'Completed';
}

export function apptRelativeColor(hour: number, minute: number, now: Date): string {
  const diff = diffMin(hour, minute, now);
  if (diff >= -5 && diff <= 5) return 'text-green-600';
  if (diff > 5 && diff <= 30) return 'text-amber-500';
  return 'text-gray-400';
}

export function apptDotColor(hour: number, minute: number, now: Date): string {
  const diff = diffMin(hour, minute, now);
  if (diff >= -5 && diff <= 5) return 'bg-green-500';
  if (diff > 5 && diff <= 30) return 'bg-amber-400';
  return 'bg-gray-400';
}
