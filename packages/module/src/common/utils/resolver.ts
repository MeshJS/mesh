export const resolveFingerprint = (policyId: string, assetName: string) => {
  return `${policyId}${assetName}`; // TODO: CIP 14 - User-Facing Asset Fingerprint
}
