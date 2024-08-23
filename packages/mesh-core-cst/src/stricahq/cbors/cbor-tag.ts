export default class CborTag {
    value: any;
  
    tag: number;
  
    constructor(value: any, tag: number) {
      this.value = value;
      this.tag = tag;
    }
  
    private byteSpan: [number, number] = [0, 0];
  
    setByteSpan(byteSpan: [number, number]) {
      this.byteSpan = byteSpan;
    }
  
    getByteSpan(): [number, number] {
      return this.byteSpan;
    }
  }