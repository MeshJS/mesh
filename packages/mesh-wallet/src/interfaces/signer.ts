export interface ISigner {
  getPublicKey(): Promise<string>;
  getPublicKeyHash(): Promise<string>;
  sign(data: string): Promise<string>;
  verify(data: string, signature: string): Promise<boolean>;
}
