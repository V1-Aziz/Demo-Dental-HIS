import bcrypt from 'bcrypt';

// Cost factor for bcrypt. 12 is a reasonable 2024+ default: ~250ms/hash on
// modern hardware — slow enough to resist brute force, fast enough not to
// bottleneck login. Increase ONLY when upgrading hardware; lowering
// invalidates the security assumptions of previously stored hashes.
const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
