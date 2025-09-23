export interface ISigner {
  getPublicKey(): string;
  sign(data: string): string;
  verify(data: string, signature: string): boolean;
}
