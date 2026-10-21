import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCK_RECORD,
  hashPin,
  isValidPinFormat,
  resolveLockRecord,
  sha256Hex,
  verifyPin,
  type DigestFn,
  type LockRecord,
} from "../src/engine/lock.js";
import { InMemoryStorageAdapter } from "../src/adapters/memory-storage.js";
import { LockStore } from "../src/runtime/lock-store.js";

/** Deterministic stub digest: a stable 64-char hex fingerprint of
 *  its input, so stored records pass the same shape validation the
 *  real SHA-256 output does (resolveLockRecord requires hex-64). */
const stubDigest: DigestFn = (data) => {
  const hex = [...data]
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
  return Promise.resolve(hex.padEnd(64, "0").slice(0, 64));
};

function stubStore(raw?: unknown): {
  port: InMemoryStorageAdapter;
  store: LockStore;
} {
  const port = new InMemoryStorageAdapter(raw);
  const store = new LockStore(port, {
    digest: stubDigest,
    randomSalt: () => "c0ffee1234",
  });
  return { port, store };
}

describe("PIN format", () => {
  it("accepts 4–6 digits and nothing else", () => {
    expect(isValidPinFormat("1234")).toBe(true);
    expect(isValidPinFormat("12345")).toBe(true);
    expect(isValidPinFormat("123456")).toBe(true);
    expect(isValidPinFormat("123")).toBe(false);
    expect(isValidPinFormat("1234567")).toBe(false);
    expect(isValidPinFormat("12a4")).toBe(false);
    expect(isValidPinFormat(" 1234")).toBe(false);
    expect(isValidPinFormat("")).toBe(false);
    expect(isValidPinFormat(1234)).toBe(false);
    expect(isValidPinFormat(null)).toBe(false);
  });
});

describe("PIN hashing and verification", () => {
  it("hashes through the injected digest, sensitive to salt and PIN", async () => {
    const a = await hashPin("1234", "c0ffee1234", stubDigest);
    expect(a).toBe(await hashPin("1234", "c0ffee1234", stubDigest));
    expect(a).not.toBe(await hashPin("1235", "c0ffee1234", stubDigest));
    expect(a).not.toBe(await hashPin("1234", "othersalt", stubDigest));
  });

  it("verifies the right PIN and rejects wrong ones", async () => {
    const record: LockRecord = {
      salt: "c0ffee1234",
      pinHash: await hashPin("1234", "c0ffee1234", stubDigest),
      locked: false,
      autoLockMinutes: 0,
    };
    await expect(verifyPin("1234", record, stubDigest)).resolves.toBe(true);
    await expect(verifyPin("9999", record, stubDigest)).resolves.toBe(false);
    await expect(verifyPin("123", record, stubDigest)).resolves.toBe(false);
  });

  it("never verifies against a record without a PIN", async () => {
    await expect(
      verifyPin("1234", DEFAULT_LOCK_RECORD, stubDigest),
    ).resolves.toBe(false);
  });

  it("round-trips with the real SHA-256 digest", async () => {
    const pinHash = await hashPin("975310", "0123456789abcdef");
    expect(pinHash).toMatch(/^[0-9a-f]{64}$/);
    const record: LockRecord = {
      salt: "0123456789abcdef",
      pinHash,
      locked: false,
      autoLockMinutes: 0,
    };
    await expect(verifyPin("975310", record)).resolves.toBe(true);
    await expect(verifyPin("975311", record)).resolves.toBe(false);
    // Known SHA-256 vector, anchoring the digest itself.
    await expect(sha256Hex("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("resolveLockRecord", () => {
  it("degrades junk to the defaults", () => {
    expect(resolveLockRecord(undefined)).toEqual(DEFAULT_LOCK_RECORD);
    expect(resolveLockRecord(null)).toEqual(DEFAULT_LOCK_RECORD);
    expect(resolveLockRecord("locked")).toEqual(DEFAULT_LOCK_RECORD);
    expect(resolveLockRecord([1, 2])).toEqual(DEFAULT_LOCK_RECORD);
  });

  it("keeps salt and hash only as a valid pair", () => {
    const hash = "a".repeat(64);
    expect(
      resolveLockRecord({ salt: "beef", pinHash: hash, locked: true }),
    ).toEqual({ salt: "beef", pinHash: hash, locked: true, autoLockMinutes: 0 });
    // A hash without its salt (or vice versa) can never verify:
    // both fall back to null rather than stranding the user.
    expect(resolveLockRecord({ pinHash: hash }).pinHash).toBeNull();
    expect(resolveLockRecord({ salt: "beef" }).salt).toBeNull();
    expect(
      resolveLockRecord({ salt: "beef", pinHash: "not-a-hash" }).pinHash,
    ).toBeNull();
  });

  it("only the offered auto-lock values survive", () => {
    expect(resolveLockRecord({ autoLockMinutes: 15 }).autoLockMinutes).toBe(15);
    expect(resolveLockRecord({ autoLockMinutes: 7 }).autoLockMinutes).toBe(0);
    expect(resolveLockRecord({ autoLockMinutes: "5" }).autoLockMinutes).toBe(0);
  });
});

describe("LockStore", () => {
  it("ensureSeeded materialises defaults exactly once, only when absent", async () => {
    const { port, store } = stubStore(undefined);
    await store.ensureSeeded();
    expect(await port.get()).toEqual(DEFAULT_LOCK_RECORD);
    await store.setPin("1234");
    await store.ensureSeeded();
    expect((await store.read()).pinHash).not.toBeNull();
  });

  it("setPin stores only a salt and a hash — never the PIN itself", async () => {
    const port = new InMemoryStorageAdapter(undefined);
    const store = new LockStore(port, { randomSalt: () => "0123456789abcdef" });
    const record = await store.setPin("975310");
    expect(Object.keys(record).sort()).toEqual([
      "autoLockMinutes",
      "locked",
      "pinHash",
      "salt",
    ]);
    expect(record.salt).toBe("0123456789abcdef");
    expect(record.pinHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.pinHash).not.toBe("975310");
    await expect(store.verifyPin("975310")).resolves.toBe(true);
    await expect(store.verifyPin("975311")).resolves.toBe(false);
  });

  it("setPin rejects a malformed PIN", async () => {
    const { store } = stubStore(undefined);
    await expect(store.setPin("123")).rejects.toBeInstanceOf(RangeError);
    await expect(store.setPin("12x4")).rejects.toBeInstanceOf(RangeError);
    expect((await store.read()).pinHash).toBeNull();
  });

  it("setPin preserves the locked state", async () => {
    const { store } = stubStore(undefined);
    await store.setPin("1234");
    await store.setLocked(true);
    await store.setPin("5678");
    const record = await store.read();
    expect(record.locked).toBe(true);
    await expect(store.verifyPin("5678")).resolves.toBe(true);
    await expect(store.verifyPin("1234")).resolves.toBe(false);
  });

  it("setLocked flips only the locked flag and notifies subscribers", async () => {
    const { store } = stubStore(undefined);
    await store.setPin("1234");
    const seen: LockRecord[] = [];
    const unsubscribe = store.subscribe((r) => seen.push(r));
    await store.setLocked(true);
    expect((await store.read()).locked).toBe(true);
    expect(seen.at(-1)?.locked).toBe(true);
    await store.setLocked(false);
    expect((await store.read()).locked).toBe(false);
    unsubscribe();
  });

  it("clearPin removes the PIN and unlocks", async () => {
    const { store } = stubStore(undefined);
    await store.setPin("1234");
    await store.setLocked(true);
    const record = await store.clearPin();
    expect(record).toEqual(DEFAULT_LOCK_RECORD);
    expect(await store.read()).toEqual(DEFAULT_LOCK_RECORD);
  });

  it("setAutoLockMinutes persists offered values and degrades others to off", async () => {
    const { store } = stubStore(undefined);
    expect((await store.setAutoLockMinutes(30)).autoLockMinutes).toBe(30);
    expect((await store.setAutoLockMinutes(3)).autoLockMinutes).toBe(0);
  });
});

describe("worker lock-now path (LockStore.lockNow)", () => {
  it("refuses to lock when no PIN exists", async () => {
    const { port, store } = stubStore(undefined);
    await expect(store.lockNow()).resolves.toBe(false);
    expect((await store.read()).locked).toBe(false);
    expect(await port.get()).toBeUndefined();
  });

  it("locks when a PIN exists", async () => {
    const { store } = stubStore(undefined);
    await store.setPin("1234");
    await expect(store.lockNow()).resolves.toBe(true);
    expect((await store.read()).locked).toBe(true);
  });
});
