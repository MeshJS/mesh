import { Metatags } from '../../components';
// import CreatePrivateKeyWallet from '../../components/walletprivatekey/createWallet';
// import TestTx from '../../components/walletprivatekey/testTx';

/**
 * 1. connect a dapp wallet and get login session
 * 2. after login, create new minting wallet or use existing wallet (these wallets are custodial wallets)
 * 3. after selected wallet, create new policy or use existing policy
 * 
 * note:
 * hmm, i think we need to save private key instead of encrypted keys for minting, if not during minting, we need those passwords
 */

const Minting = () => {
  return (
    <>
      <Metatags title="Minting" />
      <h1>Minting</h1>
      {/*<CreatePrivateKeyWallet />
      <TestTx />*/}
    </>
  );
};

export default Minting;
