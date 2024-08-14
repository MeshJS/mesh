/* eslint-disable no-bitwise */
import { Buffer } from "buffer";
import BigNumber from "bignumber.js";
import { CborTag } from ".";
import { IndefiniteArray, IndefiniteMap } from "./helpers";
import {
  MAX_BIG_NUM_INT,
  MAX_BIG_NUM_INT32,
  MAX_BIG_NUM_INT64,
  POW_2_32,
  POW_2_53,
  SHIFT32,
} from "./utils";

const NAN_BUF = Buffer.from("f97e00", "hex");
const BREAK = Buffer.from("ff", "hex");

export default (
  input: any,
  options: { collapseBigNumber: Boolean } = { collapseBigNumber: true }
) => {
  const outBufAry: Array<Buffer> = [];

  function pushFloat64(value: number) {
    const buf = Buffer.allocUnsafe(8);
    buf.writeDoubleBE(value);
    outBufAry.push(buf);
  }
  function pushUInt8(value: number) {
    const buf = Buffer.allocUnsafe(1);
    buf.writeUInt8(value, 0);
    outBufAry.push(buf);
  }
  function pushBuffer(value: Buffer) {
    outBufAry.push(value);
  }
  function pushUInt16(value: number) {
    const buf = Buffer.allocUnsafe(2);
    buf.writeUInt16BE(value, 0);
    outBufAry.push(buf);
  }
  function pushUInt32(value: number) {
    const buf = Buffer.allocUnsafe(4);
    buf.writeUInt32BE(value, 0);
    outBufAry.push(buf);
  }
  function pushUInt64(value: number) {
    const low = value % POW_2_32;
    const high = (value - low) / POW_2_32;
    const buf = Buffer.allocUnsafe(8);
    buf.writeUInt32BE(high, 0);
    buf.writeUInt32BE(low, 4);
    outBufAry.push(buf);
  }
  function pushTypeAndLength(type: number, length: number) {
    if (length < 24) {
      pushUInt8((type << 5) | length);
    } else if (length < 0x100) {
      pushUInt8((type << 5) | 24);
      pushUInt8(length);
    } else if (length < 0x10000) {
      pushUInt8((type << 5) | 25);
      pushUInt16(length);
    } else if (length < 0x100000000) {
      pushUInt8((type << 5) | 26);
      pushUInt32(length);
    } else {
      pushUInt8((type << 5) | 27);
      pushUInt64(length);
    }
  }
  function pushIntNum(value: number) {
    if (Object.is(value, -0)) {
      return pushBuffer(Buffer.from("f98000", "hex"));
    }
    if (value >= 0 && value <= POW_2_53) {
      return pushTypeAndLength(0, value);
    }
    if (-POW_2_53 <= value && value < 0) {
      return pushTypeAndLength(1, -(value + 1));
    }
  }
  function pushBigInt(value: BigNumber) {
    let valueM = value;
    let type = 0;
    let tag = 2;

    if (valueM.isNegative()) {
      valueM = valueM.negated().minus(1);
      type = 1;
      tag = 3;
    }

    if (options.collapseBigNumber && valueM.lte(MAX_BIG_NUM_INT64)) {
      if (valueM.lte(MAX_BIG_NUM_INT32)) {
        return pushTypeAndLength(type, valueM.toNumber());
      }
      pushUInt8((type << 5) | 27);
      pushUInt32(valueM.dividedToIntegerBy(SHIFT32).toNumber());
      pushUInt32(valueM.mod(SHIFT32).toNumber());
    } else {
      let str = valueM.toString(16);
      if (str.length % 2) {
        str = `0${str}`;
      }
      // push tag
      pushTypeAndLength(6, tag);

      // push buffer
      const buf = Buffer.from(str, "hex");
      pushTypeAndLength(2, buf.length);
      pushBuffer(buf);
    }
  }
  function pushBigNumber(value: BigNumber) {
    if (value.isNaN()) {
      pushBuffer(NAN_BUF);
    } else if (value.isInteger()) {
      pushBigInt(value);
    } else {
      // push decimal
      pushTypeAndLength(6, 4);
      pushTypeAndLength(4, 2);
      const dec = value.decimalPlaces();
      const slide = value.shiftedBy(dec!);
      pushIntNum(-dec!);
      if (slide.abs().isLessThan(MAX_BIG_NUM_INT)) {
        pushIntNum(slide.toNumber());
      } else {
        pushBigInt(slide);
      }
    }
  }

  function encodeItem(value: any) {
    if (value === false) return pushUInt8(0xf4);
    if (value === true) return pushUInt8(0xf5);
    if (value === null) return pushUInt8(0xf6);
    if (value === undefined) return pushUInt8(0xf7);

    switch (typeof value) {
      case "number": {
        if (Math.round(value) === value) {
          return pushIntNum(value);
        }
        pushUInt8(0xfb);
        return pushFloat64(value);
      }
      case "string": {
        const strBuff = Buffer.from(value, "utf8");
        pushTypeAndLength(3, strBuff.length);
        return pushBuffer(strBuff);
      }
      default: {
        if (Array.isArray(value)) {
          if (value instanceof IndefiniteArray) {
            pushUInt8((4 << 5) | 31);
          } else {
            pushTypeAndLength(4, value.length);
          }
          for (const v of value) {
            encodeItem(v);
          }
          if (value instanceof IndefiniteArray) {
            pushBuffer(BREAK);
          }
        } else if (value instanceof Buffer) {
          pushTypeAndLength(2, value.length);
          pushBuffer(value);
        } else if (value instanceof ArrayBuffer) {
          const buf = Buffer.from(value);
          pushTypeAndLength(2, buf.length);
          pushBuffer(buf);
        } else if (value instanceof Uint8ClampedArray) {
          const buf = Buffer.from(value);
          pushTypeAndLength(2, buf.length);
          pushBuffer(buf);
        } else if (value instanceof Uint8Array) {
          const buf = Buffer.from(value);
          pushTypeAndLength(2, buf.length);
          pushBuffer(buf);
        } else if (BigNumber.isBigNumber(value)) {
          pushBigNumber(value);
        } else if (value instanceof CborTag) {
          pushTypeAndLength(6, value.tag);
          encodeItem(value.value);
        } else {
          let entries;
          if (value instanceof Map) {
            entries = [...value.entries()];
          } else {
            entries = [...Object.entries(value)];
          }
          if (value instanceof IndefiniteMap) {
            pushUInt8((5 << 5) | 31);
          } else {
            pushTypeAndLength(5, entries.length);
          }
          for (const [key, v] of entries) {
            encodeItem(key);
            encodeItem(v);
          }
          if (value instanceof IndefiniteMap) {
            pushBuffer(BREAK);
          }
        }
      }
    }
  }

  encodeItem(input);
  return Buffer.concat(outBufAry);
};
