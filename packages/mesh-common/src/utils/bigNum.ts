export class BigNum {
  value: bigint;

  constructor(value: number | string) {
    this.value = BigInt(value);
  }

  // Operators

  divFloor(other: BigNum): BigNum {
    this.value = this.value / other.value;
    return this;
  }

  checkedMul(other: BigNum): BigNum {
    this.value *= other.value;
    return this;
  }

  checkedAdd(other: BigNum): BigNum {
    this.value += other.value;
    return this;
  }

  checkedSub(other: BigNum): BigNum {
    this.value -= other.value;
    return this;
  }

  clampedSub(other: BigNum): BigNum {
    const result = this.value - other.value;
    this.value = result < 0n ? 0n : result;
    return this;
  }

  // Comparators

  lessThan(other: BigNum): boolean {
    return this.value < other.value;
  }

  compare(other: BigNum): -1 | 0 | 1 {
    if (this.value === other.value) {
      return 0;
    } else if (this.value < other.value) {
      return -1;
    } else {
      return 1;
    }
  }

  static new = (value: number | string): BigNum => {
    return new BigNum(value);
  };

  // Override

  toString(): string {
    return this.value.toString();
  }
}
