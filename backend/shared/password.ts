/**
 * パスワードのハッシュ化・検証。外部依存を増やさないためNode標準 `crypto` の scrypt を使用する。
 * 保存形式: "<saltHex>:<derivedKeyHex>"
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

/** パスワードをハッシュ化する（ランダムソルト付き） */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derived}`;
}

/** パスワードが保存済みハッシュと一致するか検証する */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const keyBuffer = Buffer.from(key, "hex");
  const derived = scryptSync(password, salt, keyBuffer.length);
  if (derived.length !== keyBuffer.length) return false;
  return timingSafeEqual(derived, keyBuffer);
}
