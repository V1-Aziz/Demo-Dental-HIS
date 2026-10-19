import { Request } from 'express';
import { findUserByEmail, updateLastLogin } from '../repositories/auth.repository';
import { comparePassword } from '../utils/password.util';
import { signAccessToken, signRefreshToken, verifyRefreshToken, TokenPayload } from '../utils/token.util';
import { LoginInput } from '../validators/auth.validator';
import {
  createSession,
  validateAndTouchRefreshSession,
  rotateRefreshToken,
  revokeByRefreshToken,
} from './session.service';

export async function loginService(input: LoginInput, req: Request) {
  const user = await findUserByEmail(input.email);
  // Use the same generic message whether the email is wrong OR the password
  // is wrong — otherwise attackers can probe which emails exist in the system.
  if (!user) throw new Error('Invalid credentials');
  if (user.account_status !== 'Active') throw new Error('Account is not active');

  const match = await comparePassword(input.password, user.password);
  if (!match) throw new Error('Invalid credentials');

  await updateLastLogin(user.user_id);

  // employee_id / academic_id are included so downstream code can skip a JOIN;
  // they're `null` in the DB for role/user mismatches, coerced to undefined
  // so they don't leak into the JWT as `null`.
  const basePayload = {
    userId: user.user_id,
    role: user.role_name,
    employeeId: user.employee_id ?? undefined,
    academicId: user.academic_id ?? undefined,
  };

  // Mint refresh token first, then create the session so we can include
  // session_id in the access token payload.
  const refreshToken = signRefreshToken(basePayload);
  const sessionId    = await createSession(user.user_id, refreshToken, req);

  const accessToken = signAccessToken({ ...basePayload, sessionId });

  return {
    user: { id: user.user_id, name: user.full_name, role: user.role_name },
    accessToken,
    refreshToken,
  };
}

export async function refreshService(refreshToken: string) {
  let payload: TokenPayload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new Error('Invalid or expired refresh token');
  }

  // Validate against DB and update last_activity_at.
  const session = await validateAndTouchRefreshSession(refreshToken);

  // Rotate: issue a new refresh token and update the session row.
  const newBasePayload = {
    userId: payload.userId,
    role: payload.role,
    employeeId: payload.employeeId,
    academicId: payload.academicId,
  };
  const newRefreshToken = signRefreshToken(newBasePayload);
  await rotateRefreshToken(session.session_id, newRefreshToken);

  const newAccessToken = signAccessToken({ ...newBasePayload, sessionId: session.session_id });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

export async function logoutService(refreshToken: string): Promise<void> {
  await revokeByRefreshToken(refreshToken);
}
