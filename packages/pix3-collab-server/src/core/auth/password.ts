import bcrypt from 'bcrypt';
import { config } from '../../config.js';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.PASSWORD_SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
