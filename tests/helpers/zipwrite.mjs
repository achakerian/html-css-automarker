import { deflateRawSync } from 'node:zlib';

const TBL = (() => { const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c; } return t; })();
export function crc32(buf) { let c = ~0;
  for (let i = 0; i < buf.length; i++) c = TBL[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return ~c >>> 0; }

// entries: [{path, data: Buffer|string}]; store=true disables compression
export function buildZip(entries, { store = false } = {}) {
  const chunks = [], central = []; let offset = 0;
  const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
  for (const e of entries) {
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8');
    const comp = store ? raw : deflateRawSync(raw);
    const method = store ? 0 : 8, crc = crc32(raw), name = Buffer.from(e.path, 'utf8');
    const head = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(method), u16(0), u16(0),
      u32(crc), u32(comp.length), u32(raw.length), u16(name.length), u16(0), name]);
    chunks.push(head, comp);
    central.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(method), u16(0), u16(0),
      u32(crc), u32(comp.length), u32(raw.length), u16(name.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), name]));
    offset += head.length + comp.length;
  }
  const cd = Buffer.concat(central), cdOff = offset;
  const eocd = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(cd.length), u32(cdOff), u16(0)]);
  return Buffer.concat([...chunks, cd, eocd]);
}
