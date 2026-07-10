export type SourceLabel = "lamps" | "jitter" | "mouse" | "csprng";

export class EntropyPool {
  private pool = new Uint8Array(32);
  private counter = 0;
  totalMixes = 0;
  onMix?: (label: SourceLabel, bytes: number) => void;

  async mix(label: SourceLabel, material: Uint8Array): Promise<void> {
    const labelBytes = new TextEncoder().encode(label);
    const buf = new Uint8Array(
      this.pool.length + labelBytes.length + material.length,
    );
    buf.set(this.pool, 0);
    buf.set(labelBytes, this.pool.length);
    buf.set(material, this.pool.length + labelBytes.length);
    this.pool = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
    this.totalMixes++;
    this.onMix?.(label, material.length);
  }

  async derive(n: number): Promise<Uint8Array> {
    const out = new Uint8Array(n);
    let off = 0;
    while (off < n) {
      const buf = new Uint8Array(36);
      buf.set(this.pool, 0);
      new DataView(buf.buffer).setUint32(32, this.counter++);
      const block = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
      out.set(block.subarray(0, Math.min(32, n - off)), off);
      off += 32;
    }

    const r = new Uint8Array(33);
    r.set(this.pool, 0);
    r[32] = 0x52;
    this.pool = new Uint8Array(await crypto.subtle.digest("SHA-256", r));
    return out;
  }
}

export function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export function toUuid(bytes: Uint8Array): string {
  const b = bytes.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = toHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function toDie(bytes: Uint8Array, sides: number): number {
  const limit = 256 - (256 % sides);
  for (const b of bytes) {
    if (b < limit) return (b % sides) + 1;
  }
  return (bytes[bytes.length - 1] % sides) + 1;
}

export function toCoins(bytes: Uint8Array, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += bytes[i] & 1 ? "H" : "T";
  return s;
}

