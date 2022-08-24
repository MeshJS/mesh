import { useState, useEffect } from 'react';
import { Button, Card, Codeblock, Input, Toggle } from '../../components';
import { AssetsContainer } from '../blocks/assetscontainer';
import useWallet from '../../contexts/wallet';
import {
  TransactionService,
  resolveDataHash,
  KoiosProvider,
  resolveKeyHash,
} from '@martifylabs/mesh';
import type { Asset } from '@martifylabs/mesh';
import { LinkCardanoscanTx } from '../blocks/linkCardanoscanTx';
import ConnectWallet from '../wallet/connectWallet';

export default function LockUnlockContract() {
  // const messageFromError = {
  //   error: 'Bad Request',
  //   message:
  //     '"transaction submit error ShelleyTxValidationError ShelleyBasedEraBabbage (ApplyTxError [UtxowFailure (UtxoFailure (FromAlonzoUtxoFail (UtxosFailure (ValidationTagMismatch (IsValid True) (FailedUnexpectedly (PlutusFailure \\"\\\\nThe 3 arg plutus script (PlutusScript PlutusV1 ScriptHash \\\\\\"243a7e16c77997d7fe1964b79721873c24c0927739fc78c8e00fbfd9\\\\\\") fails.\\\\nCekError An error has occurred:  User error:\\\\nThe machine terminated because of an error, either from a built-in function or from an explicit use of \'error\'.\\\\nThe protocol version is: ProtVer {pvMajor = 7, pvMinor = 0}\\\\nThe data is: Constr 0 [Constr 0 [B \\\\\\"\\\\\\\\161\\\\\\\\131\\\\\\\\191\\\\\\\\134\\\\\\\\146_f\\\\\\\\197y\\\\\\\\163t\\\\\\\\\\\\\\\\\\\\\\\\149\\\\\\\\ETBtC\\\\\\\\153g\\\\\\\\155\\\\\\\\t\\\\\\\\t\'\\\\\\\\184\\\\\\\\246\\\\\\\\226\\\\\\\\242\\\\\\\\225\\\\\\\\187\\\\\\",B \\\\\\"adapeAlcottRich\\\\\\"],Constr 0 [B \\\\\\"\\\\\\\\154N\\\\\\\\133R\\\\\\\\147\\\\\\\\160\\\\\\\\185\\\\\\\\175^P\\\\\\\\147Z3\\\\\\\\GS\\\\\\\\131\\\\\\\\231\\\\\\\\152*\\\\\\\\181\\\\\\\\183\\\\\\\\&8\\\\\\\\234\\\\\\\\SOo\\\\\\\\192\\\\\\\\249\\\\\\\\230V\\\\\\",B \\\\\\"FRAME_99034_L0\\\\\\"],B \\\\\\"\\\\\\\\190\\\\\\\\161\\\\\\\\197!\\\\\\\\223X\\\\\\\\244\\\\\\\\238\\\\\\\\239`\\\\\\\\198G\\\\\\\\229\\\\\\\\235\\\\\\\\216\\\\\\\\140`9\\\\\\\\145T\\\\\\\\t\\\\\\\\249\\\\\\\\253dT\\\\\\\\164v\\\\\\\\184\\\\\\"]\\\\nThe redeemer is: Constr 0 []\\\\nThe context is:\\\\nPurpose: Spending (TxOutRef {txOutRefId = 3d46187dbc26a0fcfd29a717bf02d2aadcc9640d2020e36186ba7940f1d10e8c, txOutRefIdx = 0})\\\\nTxInfo:\\\\n  TxId: 857b27b4df7f06d709cfb2ab7ac6e69b78c36b3c615dd31cef69eea6645e403a\\\\n  Inputs: [ 3d46187dbc26a0fcfd29a717bf02d2aadcc9640d2020e36186ba7940f1d10e8c!0 -> - Value (Map [(,Map [(\\\\\\"\\\\\\",1297310)]),(f57f145fb8dd8373daff7cf55cea181669e99c4b73328531ebd4419a,Map [(\\\\\\"SOCIETY\\\\\\",1)])]) addressed to\\\\n                                                                                    ScriptCredential: 243a7e16c77997d7fe1964b79721873c24c0927739fc78c8e00fbfd9 (no staking credential)\\\\n          , 3d46187dbc26a0fcfd29a717bf02d2aadcc9640d2020e36186ba7940f1d10e8c!1 -> - Value (Map [(,Map [(\\\\\\"\\\\\\",873554248)]),(f57f145fb8dd8373daff7cf55cea181669e99c4b73328531ebd4419a,Map [(\\\\\\"SOCIETY\\\\\\",9994)])]) addressed to\\\\n                                                                                    PubKeyCredential: 33bdb501b99a223232869482558c4d5ecbb7772c6c91ad6522b64844 (StakingHash PubKeyCredential: 8cfb40854d41392b624b678012443d61015f5575627a467c450396c9) ]\\\\n  Outputs: [ - Value (Map [(,Map [(\\\\\\"\\\\\\",1297310)]),(f57f145fb8dd8373daff7cf55cea181669e99c4b73328531ebd4419a,Map [(\\\\\\"SOCIETY\\\\\\",1)])]) addressed to\\\\n               PubKeyCredential: 6172049160f09786814c1b456a72dc3854b38a5ae799b44c8c62241f (StakingHash PubKeyCredential: 8cfb40854d41392b624b678012443d61015f5575627a467c450396c9)\\\\n           , - Value (Map [(,Map [(\\\\\\"\\\\\\",3000000)])]) addressed to\\\\n               PubKeyCredential: 6172049160f09786814c1b456a72dc3854b38a5ae799b44c8c62241f (StakingHash PubKeyCredential: 8cfb40854d41392b624b678012443d61015f5575627a467c450396c9)\\\\n           , - Value (Map [(,Map [(\\\\\\"\\\\\\",869611863)]),(f57f145fb8dd8373daff7cf55cea181669e99c4b73328531ebd4419a,Map [(\\\\\\"SOCIETY\\\\\\",9994)])]) addressed to\\\\n               PubKeyCredential: 6172049160f09786814c1b456a72dc3854b38a5ae799b44c8c62241f (StakingHash PubKeyCredential: 8cfb40854d41392b624b678012443d61015f5575627a467c450396c9) ]\\\\n  Fee: Value (Map [(,Map [(\\\\\\"\\\\\\",942385)])])\\\\n  Value minted: Value (Map [])\\\\n  DCerts: []\\\\n  Wdrl: []\\\\n  Valid range: (-\\\\8734 , +\\\\8734)\\\\n  Signatories: [c8b7333b533eedce34c6cee1098aa3797d51cb19a4db50bf56be3243]\\\\n  Datums: [ ( 9aa052f2b8e770229a7eef24b0c6bdfdd7e094c48985d7d010ceb68d55c35e5a\\\\n          , <<\\\\\\"\\\\\\\\161\\\\\\\\131\\\\\\\\191\\\\\\\\134\\\\\\\\146_f\\\\\\\\197y\\\\\\\\163t\\\\\\\\\\\\\\\\\\\\\\\\149\\\\\\\\ETBtC\\\\\\\\153g\\\\\\\\155\\\\\\\\t\\\\\\\\t\'\\\\\\\\184\\\\\\\\246\\\\\\\\226\\\\\\\\242\\\\\\\\225\\\\\\\\187\\\\\\",\\\\n          \\\\\\"adapeAlcottRich\\\\\\">,\\\\n          <\\\\\\"\\\\\\\\154N\\\\\\\\133R\\\\\\\\147\\\\\\\\160\\\\\\\\185\\\\\\\\175^P\\\\\\\\147Z3\\\\\\\\GS\\\\\\\\131\\\\\\\\231\\\\\\\\152*\\\\\\\\181\\\\\\\\183\\\\\\\\&8\\\\\\\\234\\\\\\\\SOo\\\\\\\\192\\\\\\\\249\\\\\\\\230V\\\\\\",\\\\n          \\\\\\"FRAME_99034_L0\\\\\\">,\\\\n          \\\\\\"\\\\\\\\190\\\\\\\\161\\\\\\\\197!\\\\\\\\223X\\\\\\\\244\\\\\\\\238\\\\\\\\239`\\\\\\\\198G\\\\\\\\229\\\\\\\\235\\\\\\\\216\\\\\\\\140`9\\\\\\\\145T\\\\\\\\t\\\\\\\\249\\\\\\\\253dT\\\\\\\\164v\\\\\\\\184\\\\\\"> ) ]\\\\n\\" \\"hgCYphoAAyNhGQMsAQEZA+gZAjsAARkD6BlecQQBGQPoGCAaAAHKdhko6wQZWdgYZBlZ2BhkGVnYGGQZWdgYZBlZ2BhkGVnYGGQYZBhkGVnYGGQZTFEYIBoAAqz6GCAZtVEEGgADYxUZAf8AARoAAVw1GCAaAAeXdRk29AQCGgAC/5QaAAbqeBjcAAEBGQPoGW/2BAIaAAO9CBoAA07FGD4BGgAQLg8ZMSoBGgADLoAZAaUBGgAC2ngZA+gZzwYBGgABOjQYIBmo8RggGQPoGCAaAAE6rAEZ4UMEGQPoChoAAwIZGJwBGgADAhkYnAEaAAMgfBkB2QEaAAMwABkB/wEZzPMYIBn9QBggGf/VGCAZWB4YIBlAsxggGgABKt8YIBoAAv+UGgAG6ngY3AABARoAAQ+SGS2nAAEZ6rsYIBoAAv+UGgAG6ngY3AABARoAAv+UGgAG6ngY3AABARoADFBOGXcSBBoAHWr2GgABQlsEGgAEDGYABAAaAAFPqxggGgADI2EZAywBARmg3hggGgADPXYYIBl59BggGX+4GCAZqV0YIBl99xggGZWqGCAaAJBjuRkD/QqCGgBqz8AastBeAFkK/VkK+gEAADMjMiMyIzIjIyMzIiMjMyIjIzMzMzIiIiIjIzMiIyMzMiIjIyMyIyMzIiMjMyIjIyMyIzIjIyMzMyIiIzIjMiMyIzIjMiMyIiMjIyIjIyUzUwNDMwCTMzVzRm4c1VzqgDpAAEZmREZmCiAGAEACZmqgkuudcauhUAczNVBJdc641dCoAxuuNXQmrolAGI1BKNTBLM1c4kkDUFQxAATEmSYzM1c0ZuHNVc6bqgBEgACBMI1BKNTBLM1c4kkDUFQxAATEmSYzM1c0ZuHNVc6oASQABGYBhkZGRkZGRkZGRkZGZmrmjNw5qrnVAKSAAIzMzMzMwGjNQKCMjIzM1c0ZuHNVc6oASQABGYEBgdmroVACMC01dCauiUAIjUFo1MFszVziSQNQVDEABcSZJhNVc8oAIm6oAE1dCoBRmoFAFJq6FQCTM1UC91ygXGroVAIMzVQL3XKBcauhUAczUCgEQ1dCoAxmoFBmqgqgmutNXQqAKZGRkZmauaM3DmqudUAJIAAjNQIjIyMjMzVzRm4c1VzqgBJAAEZqBUZqCG601dCoARgkGroTV0SgBEagvGpgvmaucSQBA1BUMQAGBJkmE1VzygAibqgATV0KgBGRkZGZmrmjNw5qrnVACSAAIzUCgzUEN1pq6FQAjBINXQmrolACI1BeNTBfM1c4kgEDUFQxAAYEmSYTVXPKACJuqABNXQmrolACI1BaNTBbM1c4kgEDUFQxAAXEmSYTVXPKACJuqABNXQqAIZqBQ641dCoAZmoFBmqgquuIAE1dCoARgdGroTV0SgBEagrGpgrmaucSQQNQVDEABYSZJhNXRKACJq6JQARNXRKACJq6JQARNXRKACJq6JQARNXRKACJq6JQARNVc8oAIm6oAE1dCoARkZGRmZq5ozcOoAKQAxGA+YHhq6E1VzygBkZmauaM3DqAEkAIRgPGCMauhNVc8oAhGZmrmjNw6gBpABEYDxgYmroTVXPKAKRmZq5ozcOoAiQABGBCbrjV0JqrnlAGI1BRNTBSM1c4kgEDUFQxAAU0mSZJkmSYTVXOqACJuqABNXQmrolACI1BKNTBLM1c4kkDUFQxAATEmSYQSxNQSTUwSjNXOJIBA1BUNQAEtJhNVc8oAIm6oAETV0SgAiaq55QARN1QAJEJGYAIAYARAAkREREREJGZmZmZmACAWAUASAQAOAMAKAIAGAEQAJEJGYAIAYARAAiRCRmACAGAEJAAiRCRmACAGAEJAAiRCRmACAGAEJAAkJERGAIAKQkREYAYApCRERgBACkJERGACAKQAIkZEYARusABMgATVQNiIzM1Vz4AJKAcRmoBpgCGroQAjADNXRABAZkZGRkZmauaM3DmqudUANIAAjMwBzIyMjMzVzRm4c1VzqgBJAAEZgGmBiauhUAIzUBMC01dCauiUAIjUDY1MDczVziSAQNQVDEAA4SZJhNVc8oAIm6oAE1dCoAZmaqAW65QCjV0KgBGagHuuNXQmrolACI1AyNTAzM1c4khA1BUMQADRJkmE1dEoAImqueUAETdUACREJGZgAgCABgBEACRCRmACAGAEQAImaqAC651oiRGRGAEbqwATIAE1UDAiMjMzVXPgBEoBJGagEGaqBmYAxqrnVACMAU1VzygBGAIauiADAuE1dCACIkQAQkQkRmACAIAGJAAiRGRkZmauaM3DqACkAARqAQYApq6E1VzygBkZmauaM3DqAEkAESgEEagUmpgVGaucSQBA1BUMQACtJkmSYTVXOqACJuqABEhIjACADESIAESABIyMjMzVzRm4c1VzqgBJAAEZgDGAOauhUAI3WmroTV0SgBEagRmpgSGaucSQQNQVDEAAlSZJhNVc8oAIm6oAEiEjMAEAMAIgASMjMzVzRm4c1VzqgApAAEbrjV0JqrnlACI1AfNTAgM1c4kgQNQVDEAAhSZJhN1QAIkRkZGZmrmjNw6gApACEoA5GZmrmjNw6gBJABEagFGAMauhNVc8oAhGZmrmjNw6gBpAAEoBRGoERqYEZmrnEkBA1BUMQACRJkmSZJhNVc6oAIm6oAESEiIwAwBBEiIAIRIiABEgASMjMzVzRm4dQAUgAiAGIzM1c0ZuHUAJIAAgBiNQGjUwGzNXOJJA1BUMQABxJkmSYTVXOm6oAESIAISIAEgASMjIyMjIzM1c0ZuHUAFIAwgCyMzNXNGbh1ACSAKIA0jMzVzRm4dQA0gCCMwCzdcauhUAU3WmroTV0SgCkZmauaM3DqAIkAMRmAabrjV0KgDm641dCauiUAcjMzVzRm4dQBUgBCMwEjAUNXQqASbrjV0Jq6JQCSMzNXNGbh1AGSACIwFDAVNXQmqueUAsjMzVzRm4dQB0gACMBMwFjV0JqrnlAMI1AfNTAgM1c4kgQNQVDEAAhSZJkmSZJkmSZJhNVc6oAgmqueUAMTVXPKAEJqrnlABE3VAAkJERERGAOAQRCRERERmAMASAQQkREREYAoBAkREREAIJERERABkQkREREZgBAEgEEQkREREZgAgEgEEACRkZGRkZmauaM3DqACkAERmYBButNXQqAIbrTV0KgBm601dCauiUAMjMzVzRm4dQAkgACMAowCzV0JqrnlAGI1AQNTARM1c4kkDUFQxAAEkmSZJhNVc6oAYmrolABE1VzygAibqgASEiMAIAMiISIzMAEAUAQAMgASMjIzM1c0ZuHUAFIAIjAGN1xq6E1VzygBkZmauaM3DqAEkAARgEG641dCaq55QBCNQCjUwCzNXOJIBA1BUMQAAxJkmSYTVXOqACJuqABISIwAgAyEiMAEAMgAREiIyMjMzVzRm4c1VzqgBJAAEZqoBpgDGroVACMAU1dCauiUAIjUAc1MAgzVziSEDUFQxAACUmSYTVXPKACJuqABEmEgASABIiEjMwAQBAAwAiABESISMwAQAwAhEgAREjIwAQASIzADMAIAIAEzIjMiMzIiMzIiMzMzMyIiIiIzIjMzMiIiMzIiMzMiIjMiMyIzIjMyIjMiMzIiMyIzIjMiMyIzIjIzIiIjUwBAAjJTNTAkABECYTNXOJIEjQmVuZWZpY2lhcnkncyBzaWduYXR1cmUgbm90IGNvcnJlY3QAAlMyI1MA0AIiIiIiIlM1NQIjM1UwEhIAEzUBQiUzU1AkACIQAxABUCMlM1MDAzNXNGbjwDAAQMgMRNQJQARUCQAMhAyEDA1MAkAEiACNTA7ADIiABEgASABMgATIyMAEAEiMwAzACACABIhEiJTNTUBAAETU1AGADIgASITM1NQCABSIAIwBAAjM1UwBxIAEAUAQAESISMwAQAwAhIAEiEjMAEAMAIgASIiIiI',
  //   status_code: 400,
  // };
  // useEffect(() => {
  //   function escapeRegExp(string) {
  //     return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
  //   }
  //   function replaceAll(str, find, replace) {
  //     return str.replace(new RegExp(escapeRegExp(find), 'g'), replace);
  //   }

  //   try {
  //     let a = replaceAll(messageFromError.message, '\\n', '\n');

  //     throw a;
  //   } catch (error) {
  //     console.log(error);
  //   }
  // }, []);

  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>Lock and unlock assets on smart contract</h3>
          <p>
            Token locking is a feature where certain assets are reserved on the
            smart contract. The assets can only be unlocked when certain
            conditions are met, for example, when making a purchase.
          </p>
          <p>
            In this showcase, we will lock selected assets from your wallet to
            an &quot;always succeed&quot; smart contract, where unlocking assets
            requires the correct datum. In practice, multiple assets (both
            native assets and lovelace) can be sent to the contract in a single
            transaction; in this demo, we restrict to only one asset.
          </p>
          <p>Note: this feature only works on testnet.</p>
        </div>
        <div className="mt-8">
          <CodeDemo />
        </div>
      </div>
    </Card>
  );
}

function CodeDemo() {
  // const scripts = {
  //   alwayssucceed: {
  //     script: '4e4d01000033222220051200120011',
  //     address:
  //       'addr_test1wpnlxv2xv9a9ucvnvzqakwepzl9ltx7jzgm53av2e9ncv4sysemm8',
  //   },
  //   helloworld1: {
  //     script:
  //       '5860585e0100003332223232323322323232322225335300d333500c00b0035004100913500700913350010024830af38f1ab66490480048dd4000891a8021a9801000a4c24002400224c44666ae68cdd78010008030028900089100109100090009',
  //     address:
  //       'addr_test1wrs527svgl0m0ghkhramqkdae643v0q96d83jku8h8etxrs58smpj',
  //   },
  // };

  // const [selectedScript, setSelectedScript] = useState<string>('helloworld1');

  const { wallet, walletConnected } = useWallet();
  const [state, setState] = useState<number>(0);

  const [inputDatum, setInputDatum] = useState<string>('supersecret'); // user input for datum
  const [selectedAsset, setSelectedAsset] = useState<string>(
    // '8f78a4388b1a3e1a1435257e9356fa0c2cc0d3a5999d63b5886c964354657374746f6b656e'
    // '8f78a4388b1a3e1a1435257e9356fa0c2cc0d3a5999d63b5886c964354657374746f6b656e'
    // '488ae4c8cae0175c2eca8f30bdd06fdfb69a22c10b0935e7a4d22b0a5069786f73'
    ''
  ); // user input for selected asset unit

  const [resultLock, setResultLock] = useState<null | string>(null); // reponse from lock
  const [resultUnlock, setResultUnlock] = useState<null | string>(null); // reponse from unlock
  const [hasLocked, setHasLocked] = useState<boolean>(true); // toggle to show unlock section

  // always succeed
  // const script = '4e4d01000033222220051200120011';
  // const scriptAddress = 'addr_test1wpnlxv2xv9a9ucvnvzqakwepzl9ltx7jzgm53av2e9ncv4sysemm8';
  // hello world
  const script =
    '5860585e0100003332223232323322323232322225335300d333500c00b0035004100913500700913350010024830af38f1ab66490480048dd4000891a8021a9801000a4c24002400224c44666ae68cdd78010008030028900089100109100090009';
  const scriptAddress =
    'addr_test1wrs527svgl0m0ghkhramqkdae643v0q96d83jku8h8etxrs58smpj';

  function toggleSelectedAssets(index, asset: Asset) {
    setSelectedAsset(asset.unit);
  }

  async function _getAssetUtxo({ scriptAddress, asset, datum }) {
    const koiosProvider = new KoiosProvider(0);
    const utxos = await koiosProvider.fetchAssetUtxosFromAddress(
      asset,
      scriptAddress
    );
    console.log('utxos', utxos);
    const dataHash = resolveDataHash(datum);
    console.log('dataHash', dataHash);
    console.log('utxos with this asset', utxos);
    console.log(
      'utxos with datumhash',
      utxos.filter((utxo: any) => {
        return utxo.output.dataHash == dataHash;
      })
    );
    let filteredUtxo = utxos.find((utxo: any) => {
      return utxo.output.dataHash == dataHash;
    });
    return filteredUtxo;
  }

  async function makeTransactionLockAsset() {
    setState(1);
    try {
      const datum = 79600447942433; // expected 8fb8d1694f8180e8a59f23cce7a70abf0b3a92122565702529ff39baf01f87f1
      // const datum = inputDatum;

      const assets = [
        {
          unit: selectedAsset,
          quantity: '1',
        },
      ];

      const tx = new TransactionService({ initiator: wallet });
      tx.sendAssets(scriptAddress, assets, { datum: datum });
      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);
      // const koios = new KoiosProvider(0);
      // const txHash = await koios.submitTx(signedTx);
      console.log('txHash', txHash);

      setResultLock(txHash);
      setHasLocked(true);

      setState(2);
    } catch (error) {
      setResultLock(`${error}`);
      setState(0);
    }
  }

  async function makeTransactionUnlockAsset() {
    setState(3);
    try {
      const datum = 79600447942433;
      // const datum = inputDatum;

      const assetUtxo = await _getAssetUtxo({
        scriptAddress: scriptAddress,
        asset: selectedAsset,
        datum: datum,
      });
      console.log('selected utxo from script', assetUtxo);

      if (assetUtxo) {
        const address = await wallet.getChangeAddress();
        const tx = new TransactionService({ initiator: wallet });
        tx.redeemFromScript(assetUtxo, script, { datum: datum })
          .sendValue(address, assetUtxo)
          .setRequiredSigners([address]);

        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx, true);
        const txHash = await wallet.submitTx(signedTx);
        console.log('txHash', txHash);

        setResultUnlock(txHash);
        setState(4);
      } else {
        setResultUnlock('Input UTXO from script is not found.');
        setState(2);
      }
    } catch (error) {
      console.log('error', error);
      setResultUnlock(`${error}`);
      setState(2);
    }
  }

  // codeSnippet1
  // let codeSnippet1 = `const datum = '${inputDatum}';\n`;
  let codeSnippet1 = `const assets = [\n`;
  codeSnippet1 += `  {\n`;
  codeSnippet1 += `    unit: '${selectedAsset}',\n`;
  codeSnippet1 += `    quantity: '1',\n`;
  codeSnippet1 += `  }\n`;
  codeSnippet1 += `];\n\n`;

  codeSnippet1 += `const tx = new TransactionService({ initiator: wallet })\n`;
  codeSnippet1 += `  .sendAssets(\n`;
  codeSnippet1 += `    '${scriptAddress}', // SCRIPT ADDRESS HERE\n`;
  codeSnippet1 += `    assets,\n`;
  codeSnippet1 += `    { datum: 79600447942433 }\n`;
  codeSnippet1 += `  );\n\n`;

  codeSnippet1 += `const unsignedTx = await tx.build();\n`;
  codeSnippet1 += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet1 += `const txHash = await wallet.submitTx(signedTx);`;

  // codeSnippet2
  let codeSnippet2 = `import { resolveDataHash, KoiosProvider } from '@martifylabs/mesh';\n\n`;
  codeSnippet2 += `// this function fetch the UTXO from the script address\n`;
  codeSnippet2 += `async function getAssetUtxo({ scriptAddress, asset, datum }) {\n`;
  codeSnippet2 += `  const koiosProvider = new KoiosProvider(0);\n`;
  codeSnippet2 += `  const dataHash = resolveDataHash(datum);\n`;
  codeSnippet2 += `  const utxos = await koiosProvider.fetchAssetUtxosFromAddress(\n`;
  codeSnippet2 += `    asset,\n`;
  codeSnippet2 += `    scriptAddress\n`;
  codeSnippet2 += `  );\n`;
  codeSnippet2 += `  let filteredUtxo = utxos.find((utxo: any) => {\n`;
  codeSnippet2 += `    return utxo.output.dataHash == dataHash;\n`;
  codeSnippet2 += `  });\n`;
  codeSnippet2 += `  return filteredUtxo;\n`;
  codeSnippet2 += `}\n\n`;

  codeSnippet2 += `const script = '${script}'; // SCRIPT CBOR HERE\n`;
  // codeSnippet2 += `const datum = '${inputDatum}';\n`;
  codeSnippet2 += `const assetUtxo = await getAssetUtxo(\n`;
  codeSnippet2 += `  '${scriptAddress}',\n`;
  codeSnippet2 += `  '${
    selectedAsset.length > 0 ? selectedAsset : 'ASSET UNIT HERE'
  }',`;
  codeSnippet2 += `\n  79600447942433\n`;
  codeSnippet2 += `);\n\n`;

  codeSnippet2 += `const tx = new TransactionService({ initiator: wallet })\n`;
  codeSnippet2 += `  .redeemFromScript(\n`;
  codeSnippet2 += `    assetUtxo, \n`;
  codeSnippet2 += `    script, \n`;
  codeSnippet2 += `    { datum: 79600447942433 }\n`;
  codeSnippet2 += `  )\n`;
  codeSnippet2 += `  .sendValue(\n`;
  codeSnippet2 += `    await wallet.getChangeAddress(),\n`;
  codeSnippet2 += `    assetUtxo\n`;
  codeSnippet2 += `  );\n\n`;

  codeSnippet2 += `const unsignedTx = await tx.build();\n`;
  codeSnippet2 += `const signedTx = await wallet.signTx(unsignedTx, true); // note the partial sign here \n`;
  codeSnippet2 += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <>
      <h3>Lock assets</h3>
      <p>
        In this section, we will lock an asset into the smart contract by
        attaching a hash of the datum to it. Connect your wallet and fetch the
        assets. Then, selects one of the assets to be sent to the smart contract
        for locking. Lastly, we need to define the datum, the same datum hash
        must be provided to unlock the asset. In this demo, we use the datum,{' '}
        <code>79600447942433</code>, which is the datum needed to lock and
        unlock from the hello world smart contract.
      </p>

      <table className="tableForInputs not-format">
        <tbody>
          <tr>
            <td className="py-4 px-4" colSpan={2}>
              <AssetsContainer
                index={0}
                selectedAssets={{
                  [selectedAsset]: 1,
                }}
                toggleSelectedAssets={toggleSelectedAssets}
              />
            </td>
          </tr>
          {/* <tr>
            <td className="py-4 px-4 w-1/4">Datum</td>
            <td className="py-4 px-4 w-3/4">
              <Input
                value={inputDatum}
                onChange={(e) => setInputDatum(e.target.value)}
                placeholder="a secret code to create datum"
              />
            </td>
          </tr> */}
        </tbody>
      </table>

      <Codeblock data={codeSnippet1} isJson={false} />

      {walletConnected ? (
        <Button
          onClick={() => makeTransactionLockAsset()}
          disabled={state == 1}
          style={
            state == 1
              ? 'warning'
              : state == 2 && resultLock
              ? 'success'
              : 'light'
          }
        >
          Run code snippet to lock assets
        </Button>
      ) : (
        <ConnectWallet />
      )}

      {resultLock && (
        <>
          <h4>Result from lock assets</h4>
          <Codeblock data={resultLock} />
          {state >= 2 && <LinkCardanoscanTx txHash={resultLock} />}
        </>
      )}

      <div className="h-8"></div>

      <div className="flex">
        <h3>Unlock assets</h3>
        <div className="p-1">
          <Toggle value={hasLocked} onChange={setHasLocked} />
        </div>
      </div>

      {hasLocked && (
        <>
          <p>
            In this section, you can create transactions to unlock the assets
            with a redeemer that corresponds to the datum. Define the
            corresponding code to create the datum, only a transaction with the
            corrent datum hash is able to unlock the asset. Define the{' '}
            <code>unit</code> of the locked asset to search for the UTXO in the
            smart contract, which is required for the transaction&apos;s input.
          </p>
          <p>
            Note: give some time for the transaction to confirm before attempt
            unlocking, you can check the transaction status using on
            CardanoScan.
          </p>
          <table className="tableForInputs not-format">
            <tbody>
              <tr>
                <td className="py-4 px-4 w-1/4">Locked asset</td>
                <td className="py-4 px-4 w-3/4">
                  <Input
                    value={selectedAsset}
                    onChange={(e) => setSelectedAsset(e.target.value)}
                    placeholder="asset unit to unlock from contract"
                  />
                </td>
              </tr>
              {/* <tr>
                <td className="py-4 px-4 w-1/4">Datum</td>
                <td className="py-4 px-4 w-3/4">
                  <Input
                    value={inputDatum}
                    onChange={(e) => setInputDatum(e.target.value)}
                    placeholder="that secret code to unlock"
                  />
                </td>
              </tr> */}
            </tbody>
          </table>

          <Codeblock data={codeSnippet2} isJson={false} />

          {walletConnected && hasLocked && (
            <Button
              onClick={() => makeTransactionUnlockAsset()}
              disabled={state == 3}
              style={state == 3 ? 'warning' : state == 4 ? 'success' : 'light'}
            >
              Run code snippet to unlock assets
            </Button>
          )}
          {!walletConnected && <ConnectWallet />}
        </>
      )}

      {resultUnlock && (
        <>
          <h4>Result from unlock assets</h4>
          <Codeblock data={resultUnlock} />
          {state == 4 && <LinkCardanoscanTx txHash={resultUnlock} />}
        </>
      )}
    </>
  );
}
