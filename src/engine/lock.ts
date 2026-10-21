/**
 * Lock — the full-screen PIN gate (GLOSSARY: a full-screen gate,
 * unlocked by a PIN, that blocks viewing of WhatsApp Web entirely;
 * Blur is never a Lock). Pure helpers only: no DOM, no Chrome
 * globals, no storage. The persisted Lock record lives under its own
 * storage key (`wa-blur:lock`), never inside Settings — a Settings
 * reset or export must never carry or clear the PIN.
 *
 * The PIN itself is never stored. Only a random salt and the
 * SHA-256 hex of `salt + ":" + pin` are persisted. This is a
 * deterrent for casual access, not encryption: the hash check gates
 * the extension's own overlay, nothing more.
 */

export interface LockRecord {
  /** Random per-PIN salt (hex), null while no PIN is set. */
  salt: string | null;
  /** SHA-256 hex of `salt + ":" + pin`, null while no PIN is set. */
  pinHash: string | null;
  /** Whether the Lock gate is currently shown. Meaningful only
   *  alongside a PIN: locked without a PIN is treated as unlocked. */
  locked: boolean;
  /** Idle minutes before the Lock engages on its own; 0 = off. */
  autoLockMinutes: number;
}

export const DEFAULT_LOCK_RECORD: LockRecord = {
  salt: null,
  pinHash: null,
  locked: false,
  autoLockMinutes: 0,
};

/** The only auto-lock choices the Settings page offers. */
export const AUTO_LOCK_CHOICES: readonly number[] = [0, 1, 5, 15, 30];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHex(value: unknown, length?: number): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]+$/i.test(value) &&
    (length === undefined || value.length === length)
  );
}

/**
 * Validates untrusted stored data into a complete LockRecord.
 * Salt and hash are a pair: if either is missing or malformed both
 * fall back to null (a hash without its salt can never verify, so
 * the record degrades to "no PIN" rather than to an unopenable
 * gate). Unknown auto-lock values degrade to off.
 */
export function resolveLockRecord(raw: unknown): LockRecord {
  if (!isRecord(raw)) return { ...DEFAULT_LOCK_RECORD };
  const hasPair = isHex(raw.salt) && isHex(raw.pinHash, 64);
  return {
    salt: hasPair ? (raw.salt as string) : null,
    pinHash: hasPair ? (raw.pinHash as string) : null,
    locked: raw.locked === true,
    autoLockMinutes:
      typeof raw.autoLockMinutes === "number" &&
      AUTO_LOCK_CHOICES.includes(raw.autoLockMinutes)
        ? raw.autoLockMinutes
        : 0,
  };
}

/** A PIN is 4–6 digits, nothing else. The one format rule, here. */
export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === "string" && /^[0-9]{4,6}$/.test(pin);
}

/**
 * Digest seam: turns a string into its hex digest. Production wires
 * SHA-256 (below); tests inject a stub so they never depend on
 * subtle-crypto timing.
 */
export type DigestFn = (data: string) => Promise<string>;

/** SHA-256 hex via WebCrypto — available in every extension
 *  context (content, worker, options, popup) and in Node tests. */
export async function sha256Hex(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The stored hash for a candidate PIN under a given salt. */
export function hashPin(
  pin: string,
  salt: string,
  digest: DigestFn = sha256Hex,
): Promise<string> {
  return digest(`${salt}:${pin}`);
}

/** True only when the record holds a PIN and the candidate matches. */
export async function verifyPin(
  pin: string,
  record: LockRecord,
  digest: DigestFn = sha256Hex,
): Promise<boolean> {
  if (!record.salt || !record.pinHash || !isValidPinFormat(pin)) return false;
  return (await hashPin(pin, record.salt, digest)) === record.pinHash;
}

/**
 * The auto-lock rule, pure: lock once the idle time reaches the
 * configured limit. Off (0 minutes) or no PIN never locks.
 */
export function shouldAutoLock(
  nowMs: number,
  lastActivityMs: number,
  autoLockMinutes: number,
  hasPin: boolean,
): boolean {
  if (!hasPin || autoLockMinutes <= 0) return false;
  return nowMs - lastActivityMs >= autoLockMinutes * 60_000;
}
