declare module 'js-sha256' {
  export const sha256: {
    (input: string | Uint8Array): string;
    create(): {
      update(message: string | Uint8Array): void;
      hex(): string;
      arrayBuffer(): ArrayBuffer;
    };
    update(message: string | Uint8Array): {
      hex(): string;
      arrayBuffer(): ArrayBuffer;
    };
    hex(input: string | Uint8Array): string;
    array(input: string | Uint8Array): number[];
    digest(input: string | Uint8Array): number[];
    arrayBuffer(input: string | Uint8Array): ArrayBuffer;
  };

  export const sha224: {
    (input: string | Uint8Array): string;
    create(): {
      update(message: string | Uint8Array): void;
      hex(): string;
      arrayBuffer(): ArrayBuffer;
    };
    update(message: string | Uint8Array): {
      hex(): string;
      arrayBuffer(): ArrayBuffer;
    };
    hex(input: string | Uint8Array): string;
    array(input: string | Uint8Array): number[];
    digest(input: string | Uint8Array): number[];
    arrayBuffer(input: string | Uint8Array): ArrayBuffer;
  };
}
