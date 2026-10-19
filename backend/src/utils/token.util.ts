import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt.config';

// Payload embedded in every JWT. `userId` is the PK in `Users`, while
// `employeeId` / `academicId` are role-specific surrogate IDs that let
// downstream code skip a Users→Employee/Student join. `sessionId` maps to
// User_Sessions.session_id so the activity middleware knows which row to touch.
// Keep this small — it travels in every request header.
export interface TokenPayload {
  userId: number;
  role: string;
  employeeId?: number;
  academicId?: number;
  sessionId?: number;
}

// Short-lived token sent on every API call (see `auth.middleware`).
export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, jwtConfig.accessSecret, {
    expiresIn: jwtConfig.accessExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

// Long-lived token used only by POST /auth/refresh to mint new access tokens.
// Signed with a DIFFERENT secret so a leaked access token can't be swapped
// for a refresh token.
export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, jwtConfig.refreshSecret, {
    expiresIn: jwtConfig.refreshExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, jwtConfig.accessSecret) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, jwtConfig.refreshSecret) as TokenPayload;
}
