import { Buffer } from 'buffer';

export default class BufferList {
  private buf: Buffer = Buffer.alloc(0);

  get length(): number {
    return this.buf.length;
  }

  read(n: number): Buffer {
    if (n === 0) {
      return Buffer.alloc(0);
    }
    if (n < 0) {
      throw new Error('invalid length');
    }

    const chunk = this.buf.slice(0, n);
    this.buf = this.buf.slice(n);

    if (chunk.length < n) {
      throw new Error('Not enough buffer');
    }

    return chunk;
  }

  push(chunk: Buffer): void {
    if (!chunk.length) return;
    this.buf = Buffer.concat([this.buf, chunk]);
  }
}