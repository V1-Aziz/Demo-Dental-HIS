export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

// Parses ?page= and ?limit= from a query string into safe values.
// - page  clamps to >= 1
// - limit clamps to 1..100 (hard cap prevents clients from requesting huge pages)
// - offset is derived for SQL `OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
export function parsePagination(query: Record<string, unknown>): PaginationParams {
  const page = Math.max(1, parseInt(String(query['page'] ?? '1'), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(query['limit'] ?? '20'), 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}
