/**
 * Returns a human-readable relative time string.
 * - Under 1 week: "X minutes ago", "X hours ago", "X days ago"
 * - 1 week or older: formatted date (e.g. "12 Mar 2026")
 */
export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '—';

  const diffMs   = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHrs  = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins <= 1)   return 'Just now';
  if (diffMins < 60 )  return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHrs  < 24)  return `${diffHrs} hour${diffHrs === 1 ? '' : 's'} ago`;
  if (diffDays < 7)   return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Returns time remaining until an expiry date as "Xy Xm Xd".
 * Returns "Expired" if the date has passed, "—" if no date.
 */
export function timeUntilExpiry(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const expiry = new Date(dateStr);
  if (isNaN(expiry.getTime())) return '—';

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);

  if (expiry <= now) return 'Expired';

  let years  = expiry.getFullYear() - now.getFullYear();
  let months = expiry.getMonth()    - now.getMonth();
  let days   = expiry.getDate()     - now.getDate();

  if (days < 0) {
    months--;
    days += new Date(expiry.getFullYear(), expiry.getMonth(), 0).getDate();
  }
  if (months < 0) { years--; months += 12; }

  const parts: string[] = [];
  if (years  > 0) parts.push(`${years}y`);
  if (months > 0) parts.push(`${months}m`);
  if (days   > 0 || parts.length === 0) parts.push(`${days}d`);

  return parts.join(' ');
}
