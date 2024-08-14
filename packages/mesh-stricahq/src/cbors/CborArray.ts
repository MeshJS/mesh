export default class CborArray extends Array {
  private byteSpan: [number, number] = [0, 0];

  setByteSpan(byteSpan: [number, number]) {
    this.byteSpan = byteSpan;
  }

  getByteSpan(): [number, number] {
    return this.byteSpan;
  }
}
