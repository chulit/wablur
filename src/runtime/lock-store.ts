import {
  DEFAULT_LOCK_RECORD,
  hashPin,
  isValidPinFormat,
  resolveLockRecord,
  sha256Hex,
  verifyPin,
  type DigestFn,
  type LockRecord,
} from "../engine/lock.js";
import type { StoragePort } from "./blur-runtime.js";

/**
 * LockStore — the SettingsStore's sibling for the Lock record: the
 * one seam through which the PIN gate's state is read and written.
 * The record lives under its own storage key (the adapter behind
 * the port owns it), so Settings resets and exports never touch it.
 * Writes mirror SettingsStore's failure posture: a failed persist
 * degrades silently and the in-memory result is still returned.
 */

export interface LockStoreDeps {
  /** Digest for PIN hashing; defaults to SHA-256 (engine). */
  digest?: DigestFn;
  /** Salt source for new PINs; defaults to crypto randomness. */
  randomSalt?: () => string;
}

function cryptoSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class LockStore {
  private readonly digest: DigestFn;
  private readonly randomSalt: () => string;

  constructor(
    private readonly port: StoragePort,
    deps: LockStoreDeps = {},
  ) {
    this.digest = deps.digest ?? sha256Hex;
    this.randomSalt = deps.randomSalt ?? cryptoSalt;
  }

  /** Current Lock record; storage failure degrades to defaults. */
  async read(): Promise<LockRecord> {
    try {
      return resolveLockRecord(await this.port.get());
    } catch {
      return { ...DEFAULT_LOCK_RECORD };
    }
  }

  /** Resolved Lock record on every stored change. */
  subscribe(fn: (record: LockRecord) => void): () => void {
    return this.port.subscribe((raw) => fn(resolveLockRecord(raw)));
  }

  private async write(record: LockRecord): Promise<LockRecord> {
    try {
      await this.port.set(record);
    } catch {
      // As with Settings: a failed write must not throw at callers.
    }
    return record;
  }

  /** Shows or dismisses the gate — state only; surfaces react to
   *  the stored change (single path, no direct DOM shortcuts). */
  async setLocked(locked: boolean): Promise<LockRecord> {
    const current = await this.read();
    return this.write({ ...current, locked });
  }

  /**
   * The `Alt+Shift+L` / "Lock now" path: engages the gate, but only
   * when a PIN exists — locking with no PIN would strand the user
   * behind a gate nothing can open. Returns whether it locked.
   */
  async lockNow(): Promise<boolean> {
    const current = await this.read();
    if (!current.pinHash) return false;
    await this.write({ ...current, locked: true });
    return true;
  }

  /**
   * Sets or replaces the PIN: a fresh salt and hash are stored; the
   * PIN itself never is. The locked state is preserved, so changing
   * the PIN from the Settings page while a tab sits locked keeps
   * that tab locked — under the new PIN.
   */
  async setPin(pin: string): Promise<LockRecord> {
    if (!isValidPinFormat(pin)) {
      throw new RangeError("PIN must be 4–6 digits.");
    }
    const salt = this.randomSalt();
    const pinHash = await hashPin(pin, salt, this.digest);
    const current = await this.read();
    return this.write({ ...current, salt, pinHash });
  }

  /** Checks a candidate PIN against the stored salt + hash. */
  async verifyPin(pin: string): Promise<boolean> {
    return verifyPin(pin, await this.read(), this.digest);
  }

  /** Removes the PIN and unlocks: no PIN, no gate. */
  async clearPin(): Promise<LockRecord> {
    const current = await this.read();
    return this.write({ ...current, salt: null, pinHash: null, locked: false });
  }

  /** Persists the auto-lock choice; unknown values resolve to off. */
  async setAutoLockMinutes(minutes: number): Promise<LockRecord> {
    const current = await this.read();
    return this.write(resolveLockRecord({ ...current, autoLockMinutes: minutes }));
  }

  /**
   * Materialises the default Lock record if — and only if —
   * nothing is stored yet. Called by the worker on install; never
   * overwrites an existing record (above all, never a PIN).
   */
  async ensureSeeded(): Promise<void> {
    try {
      const raw = await this.port.get();
      if (raw === undefined) {
        await this.port.set({ ...DEFAULT_LOCK_RECORD });
      }
    } catch {
      // Seeding is a convenience; defaults apply without it.
    }
  }
}
