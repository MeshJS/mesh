export interface IBip32 {
  derive(path: number[]): IBip32;
  getPublicKey(): string;
  sign(data: string): string;
  verify(data: string, signature: string): boolean;
}
