/* eslint-disable no-underscore-dangle */
/* eslint-disable no-bitwise */

import { Buffer } from "buffer";
import * as stream from "stream";
import BigNumber from "bignumber.js";

import BufferList from "../buffer-list";
import CborArray from "../cbor-array";
import CborMap from "../cbor-map";
import CborTag from "../cbor-tag";
import SimpleValue from "../simple-value";
import {
  addSpanBytesToObject,
  getBigNum,
  POW_2_24,
  utf8Decoder,
} from "../utils";

const readFloat16 = (value: number): number => {
  const sign = value & 0x8000;
  let exponent = value & 0x7c00;
  const fraction = value & 0x03ff;

  if (exponent === 0x7c00) exponent = 0xff << 10;
  else if (exponent !== 0) exponent += (127 - 15) << 10;
  else if (fraction !== 0) return (sign ? -1 : 1) * fraction * POW_2_24;

  const buf = Buffer.alloc(4);
  buf.writeUInt32BE((sign << 16) | (exponent << 13) | (fraction << 13));
  return buf.readFloatBE(0);
};

const isBreakPoint = (value: number): boolean => {
  if (value !== 0xff) return false;
  return true;
};

class StricaDecoder extends stream.Transform {
  private bl: any;

  private needed: number | null = null;

  private fresh: boolean = true;

  private _parser = this.parse();

  private offset: number = 0;

  private usedBytes: Array<Buffer> = [];

  constructor() {
    super({
      writableObjectMode: false,
      readableObjectMode: true,
    });
    this.bl = new BufferList();
    this.restart();
  }

  static decode(inputBytes: Buffer): { bytes: Buffer; value: any } {
    const decoder = new StricaDecoder();
    const bs = new BufferList();
    bs.push(inputBytes);
    const parser = decoder.parse();
    let state = parser.next();

    while (!state.done) {
      const b = bs.read(state.value);
      if (b == null || b.length !== state.value) {
        throw new Error("Insufficient data");
      }
      state = parser.next(b);
    }

    if (bs.length > 0) {
      throw new Error("Remaining Bytes");
    }
    return {
      bytes: inputBytes,
      value: state.value,
    };
  }

  private readUInt64(
    f: number,
    g: number,
    startByte: number,
  ): number | BigNumber {
    const bigNum = getBigNum(f, g);
    if (BigNumber.isBigNumber(bigNum)) {
      return addSpanBytesToObject(bigNum, [startByte, this.offset]);
    }
    return bigNum;
  }

  private updateTracker(bytes: Buffer) {
    this.usedBytes.push(bytes);
    this.offset += bytes.length;
  }

  private *readIndefiniteStringLength(
    majorType: number,
    startByte: number,
  ): Generator<number, any, Buffer> {
    let bytes = yield 1;
    let length;
    const number = bytes.readUInt8(0);

    if (number === 0xff) {
      length = -1;
    } else {
      const ai = number & 0x1f;
      // read length
      const lengthReader = this.readLength(ai, startByte);
      let lengthStatus = lengthReader.next();
      while (!lengthStatus.done) {
        bytes = yield lengthStatus.value;
        lengthStatus = lengthReader.next(bytes);
      }
      length = lengthStatus.value;
      //
      if (length < 0 || number >> 5 !== majorType) {
        throw new Error("Invalid indefinite length encoding");
      }
    }
    return length;
  }

  private *readLength(
    additionalInformation: number,
    startByte: number,
  ): Generator<number, any, Buffer> {
    if (additionalInformation < 24) {
      return additionalInformation;
    }
    if (additionalInformation === 24) {
      const bytes = yield 1;
      return bytes.readUInt8(0);
    }
    if (additionalInformation === 25) {
      const bytes = yield 2;
      return bytes.readUInt16BE(0);
    }
    if (additionalInformation === 26) {
      const bytes = yield 4;
      return bytes.readUInt32BE(0);
    }
    if (additionalInformation === 27) {
      const fBytes = yield 4;
      const f = fBytes.readUInt32BE(0);
      const gBytes = yield 4;
      const g = gBytes.readUInt32BE(0);

      return this.readUInt64(f, g, startByte);
    }
    if (additionalInformation === 31) {
      return -1;
    }
    throw new Error("Invalid length encoding");
  }

  _transform(fresh: any, encoding: any, cb: any) {
    this.bl.push(fresh);

    while (this.bl.length >= (this.needed as number)) {
      let ret = null;
      let chunk;

      if (this.needed === null) {
        chunk = undefined;
      } else {
        chunk = this.bl.read(this.needed);
      }

      try {
        ret = this._parser.next(chunk);
      } catch (e) {
        return cb(e);
      }

      if (this.needed) {
        this.fresh = false;
      }

      if (ret.done) {
        this.push({
          bytes: this.usedBytes,
          value: ret.value,
        });
        this.restart();
      } else {
        this.needed = ret.value || Infinity;
      }
    }

    return cb();
  }

  private *parse(suppliedBytes?: Buffer): Generator<number, any, Buffer> {
    let startByte = this.offset;
    let bytes;
    if (suppliedBytes) {
      bytes = suppliedBytes;
      startByte -= suppliedBytes.length;
    } else {
      bytes = yield 1;
      this.updateTracker(bytes);
    }

    const value = bytes.readUInt8(0);
    const majorType = value >> 5;
    const additionalInformation = value & 0x1f;
    let length;
    if (majorType === 7) {
      if (additionalInformation === 25) {
        bytes = yield 2;
        this.updateTracker(bytes);
        const number = bytes.readUInt16BE(0);
        return readFloat16(number);
      }
      if (additionalInformation === 26) {
        bytes = yield 4;
        this.updateTracker(bytes);
        return bytes.readFloatBE(0);
      }
      if (additionalInformation === 27) {
        bytes = yield 8;
        this.updateTracker(bytes);
        return bytes.readDoubleBE(0);
      }
    }

    // read length
    const lengthReader = this.readLength(additionalInformation, startByte);
    let lengthStatus = lengthReader.next();
    while (!lengthStatus.done) {
      bytes = yield lengthStatus.value;
      this.updateTracker(bytes);
      lengthStatus = lengthReader.next(bytes);
    }
    length = lengthStatus.value;
    //

    if (length < 0 && (majorType < 2 || majorType > 6))
      throw new Error("Invalid length");

    switch (majorType) {
      case 0:
        return length;
      case 1: {
        if (length === Number.MAX_SAFE_INTEGER) {
          const bigNum = new BigNumber(-1).minus(
            new BigNumber(Number.MAX_SAFE_INTEGER.toString(16), 16),
          );
          return addSpanBytesToObject(bigNum, [startByte, this.offset]);
        }
        if (BigNumber.isBigNumber(length)) {
          const bigNum = new BigNumber(-1).minus(length);
          return addSpanBytesToObject(bigNum, [startByte, this.offset]);
        }
        return -1 - length;
      }
      case 2: {
        if (length < 0) {
          const chunks = [];
          {
            // read indefinite length
            const inDefLengthReader = this.readIndefiniteStringLength(
              majorType,
              startByte,
            );
            let inDefLengthStatus = inDefLengthReader.next();
            while (!inDefLengthStatus.done) {
              bytes = yield inDefLengthStatus.value;
              this.updateTracker(bytes);
              inDefLengthStatus = inDefLengthReader.next(bytes);
            }
            length = inDefLengthStatus.value;
            //
          }
          while (length >= 0) {
            bytes = yield length as number;
            this.updateTracker(bytes);
            chunks.push(bytes);
            {
              // read indefinite length
              const inDefLengthReader = this.readIndefiniteStringLength(
                majorType,
                startByte,
              );
              let inDefLengthStatus = inDefLengthReader.next();
              while (!inDefLengthStatus.done) {
                bytes = yield inDefLengthStatus.value;
                this.updateTracker(bytes);
                inDefLengthStatus = inDefLengthReader.next(bytes);
              }
              length = inDefLengthStatus.value;
              //
            }
          }
          const buf = Buffer.concat(chunks);
          return addSpanBytesToObject(buf, [startByte, this.offset]);
        }
        bytes = yield length as number;
        this.updateTracker(bytes);
        return addSpanBytesToObject(bytes, [startByte, this.offset]);
      }
      case 3: {
        const stringBuf: Array<Buffer> = [];
        if (length < 0) {
          {
            // read indefinite length
            const inDefLengthReader = this.readIndefiniteStringLength(
              majorType,
              startByte,
            );
            let inDefLengthStatus = inDefLengthReader.next();
            while (!inDefLengthStatus.done) {
              bytes = yield inDefLengthStatus.value;
              this.updateTracker(bytes);
              inDefLengthStatus = inDefLengthReader.next(bytes);
            }
            length = inDefLengthStatus.value;
            //
          }

          while (length >= 0) {
            bytes = yield length as number;
            this.updateTracker(bytes);
            stringBuf.push(bytes);
            //

            {
              // read indefinite length
              const inDefLengthReader = this.readIndefiniteStringLength(
                majorType,
                startByte,
              );
              let inDefLengthStatus = inDefLengthReader.next();
              while (!inDefLengthStatus.done) {
                bytes = yield inDefLengthStatus.value;
                this.updateTracker(bytes);
                inDefLengthStatus = inDefLengthReader.next(bytes);
              }
              length = inDefLengthStatus.value;
              //
            }
          }

          const string = utf8Decoder(Buffer.concat(stringBuf));
          return string;
        }
        bytes = yield length as number;
        this.updateTracker(bytes);
        const string = utf8Decoder(bytes);
        return string;
      }
      case 4: {
        if (length < 0) {
          const ary = new CborArray();
          bytes = yield 1;
          this.updateTracker(bytes);
          let bp = bytes.readUInt8(0);
          while (!isBreakPoint(bp)) {
            ary.push(yield* this.parse(bytes));

            bytes = yield 1;
            this.updateTracker(bytes);
            bp = bytes.readUInt8(0);
          }
          ary.setByteSpan([startByte, this.offset]);
          return ary;
        }
        const ary = new CborArray();
        for (let i = 0; i < length; i += 1) {
          ary.push(yield* this.parse());
        }
        ary.setByteSpan([startByte, this.offset]);
        return ary;
      }
      case 5: {
        if (length < 0) {
          const obj = new CborMap();
          bytes = yield 1;
          this.updateTracker(bytes);
          let bp = bytes.readUInt8(0);
          while (!isBreakPoint(bp)) {
            const key = yield* this.parse(bytes);
            const val = yield* this.parse();
            obj.set(key, val);

            bytes = yield 1;
            this.updateTracker(bytes);
            bp = bytes.readUInt8(0);
          }
          obj.setByteSpan([startByte, this.offset]);
          return obj;
        }
        const obj = new CborMap();

        for (let i = 0; i < length; i += 1) {
          const key = yield* this.parse();
          const val = yield* this.parse();
          obj.set(key, val);
        }

        obj.setByteSpan([startByte, this.offset]);
        return obj;
      }
      case 6: {
        const tag = new CborTag(yield* this.parse(), length as number);
        tag.setByteSpan([startByte, this.offset]);
        return tag;
      }
      case 7: {
        switch (length) {
          case 20:
            return false;
          case 21:
            return true;
          case 22:
            return null;
          case 23:
            return undefined;
          default:
            return new SimpleValue(length as number);
        }
      }
      default: {
        throw new Error("Invalid CBOR encoding");
      }
    }
  }

  private restart() {
    this.needed = null;
    this._parser = this.parse();
    this.fresh = true;
    this.offset = 0;
    this.usedBytes = [];
  }

  _flush(cb: any) {
    cb(this.fresh ? null : new Error("unexpected end of input"));
  }
}

export { StricaDecoder };
