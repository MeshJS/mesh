export interface ISigner {
  getPublicKey(): string;
  getPublicKeyHash(): string;
  sign(data: string): string;
  verify(data: string, signature: string): boolean;
}
