import { env } from './env.config';

export const jwtConfig = {
  accessSecret: env.jwt.accessSecret,
  refreshSecret: env.jwt.refreshSecret,
  accessExpiresIn: env.jwt.accessExpiresIn,
  refreshExpiresIn: env.jwt.refreshExpiresIn,
};
