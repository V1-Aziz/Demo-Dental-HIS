export interface UserSession {
  session_id: number;
  user_id: number;
  refresh_token_hash: string;
  last_activity_at: Date;
  expires_at: Date;
  ip_address: string | null;
  user_agent: string | null;
  revoked_at: Date | null;
  created_at: Date;
}

export interface ActiveUsersStats {
  count: number;
  asOf: string;          // ISO timestamp
  windowMinutes: number;
}
