import { useState } from 'react';
import { Button, Card, Codeblock, Input, Toggle } from '../../components';
import { AssetsContainer } from '../blocks/assetscontainer';
import useWallet from '../../contexts/wallet';
import {
  TransactionService,
  resolveDataHash,
  BlockfrostProvider,
  KoiosProvider,
} from '@martifylabs/mesh';
import type { Asset } from '@martifylabs/mesh';
import { LinkCardanoscanTx } from '../blocks/linkCardanoscanTx';
import ConnectWallet from '../wallet/connectWallet';

export default function LockUnlockContract() {
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
    'f57f145fb8dd8373daff7cf55cea181669e99c4b73328531ebd4419a534f4349455459'
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
  // ape only_sig
  // const script =
  //   '590afd590afa0100003323322332233223232333222323332223233333333222222223233322232333322223232332232333222323332223232332233223232333332222233223322332233223322332222323232223232533530343330093333573466e1cd55cea803a400046664446660a2006004002666aa092eb9d71aba150073335504975ceb8d5d0a8031bae357426ae8940188d4128d4c12ccd5ce249035054310004c499263333573466e1cd55ce9baa0044800081308d4128d4c12ccd5ce249035054310004c499263333573466e1cd55cea8012400046601864646464646464646464646666ae68cdc39aab9d500a480008cccccccccc068cd40a08c8c8cccd5cd19b8735573aa0049000119810181d9aba15002302d357426ae8940088d4168d4c16ccd5ce249035054310005c49926135573ca00226ea8004d5d0a80519a8140149aba150093335502f75ca05c6ae854020ccd540bdd728171aba1500733502804435742a00c66a05066aa0aa09aeb4d5d0a8029919191999ab9a3370e6aae754009200023350223232323333573466e1cd55cea80124000466a05466a086eb4d5d0a80118241aba135744a00446a0bc6a60be66ae712401035054310006049926135573ca00226ea8004d5d0a8011919191999ab9a3370e6aae7540092000233502833504375a6ae854008c120d5d09aba2500223505e35305f3357389201035054310006049926135573ca00226ea8004d5d09aba2500223505a35305b3357389201035054310005c49926135573ca00226ea8004d5d0a80219a8143ae35742a00666a05066aa0aaeb88004d5d0a801181d1aba135744a00446a0ac6a60ae66ae71241035054310005849926135744a00226ae8940044d5d1280089aba25001135744a00226ae8940044d5d1280089aba25001135573ca00226ea8004d5d0a8011919191999ab9a3370ea00290031180f981e1aba135573ca00646666ae68cdc3a801240084603c608c6ae84d55cf280211999ab9a3370ea00690011180f18189aba135573ca00a46666ae68cdc3a80224000460426eb8d5d09aab9e50062350513530523357389201035054310005349926499264984d55cea80089baa001357426ae8940088d4128d4c12ccd5ce249035054310004c49926104b13504935304a3357389201035054350004b4984d55cf280089baa001135744a00226aae7940044dd50009109198008018011000911111111109199999999980080580500480400380300280200180110009109198008018011000891091980080180109000891091980080180109000891091980080180109000909111180200290911118018029091111801002909111180080290008919118011bac001320013550362233335573e0024a01c466a01a60086ae84008c00cd5d100101991919191999ab9a3370e6aae75400d200023330073232323333573466e1cd55cea8012400046601a60626ae854008cd404c0b4d5d09aba250022350363530373357389201035054310003849926135573ca00226ea8004d5d0a801999aa805bae500a35742a00466a01eeb8d5d09aba25002235032353033335738921035054310003449926135744a00226aae7940044dd50009110919980080200180110009109198008018011000899aa800bae75a224464460046eac004c8004d540c088c8cccd55cf80112804919a80419aa81998031aab9d5002300535573ca00460086ae8800c0b84d5d08008891001091091198008020018900089119191999ab9a3370ea002900011a80418029aba135573ca00646666ae68cdc3a801240044a01046a0526a605466ae712401035054310002b499264984d55cea80089baa001121223002003112200112001232323333573466e1cd55cea8012400046600c600e6ae854008dd69aba135744a00446a0466a604866ae71241035054310002549926135573ca00226ea80048848cc00400c00880048c8cccd5cd19b8735573aa002900011bae357426aae7940088d407cd4c080cd5ce24810350543100021499261375400224464646666ae68cdc3a800a40084a00e46666ae68cdc3a8012400446a014600c6ae84d55cf280211999ab9a3370ea00690001280511a8111a981199ab9c490103505431000244992649926135573aa00226ea8004484888c00c0104488800844888004480048c8cccd5cd19b8750014800880188cccd5cd19b8750024800080188d4068d4c06ccd5ce249035054310001c499264984d55ce9baa0011220021220012001232323232323333573466e1d4005200c200b23333573466e1d4009200a200d23333573466e1d400d200823300b375c6ae854014dd69aba135744a00a46666ae68cdc3a8022400c46601a6eb8d5d0a8039bae357426ae89401c8cccd5cd19b875005480108cc048c050d5d0a8049bae357426ae8940248cccd5cd19b875006480088c050c054d5d09aab9e500b23333573466e1d401d2000230133016357426aae7940308d407cd4c080cd5ce2481035054310002149926499264992649926135573aa00826aae79400c4d55cf280109aab9e500113754002424444444600e01044244444446600c012010424444444600a010244444440082444444400644244444446600401201044244444446600201201040024646464646666ae68cdc3a800a400446660106eb4d5d0a8021bad35742a0066eb4d5d09aba2500323333573466e1d400920002300a300b357426aae7940188d4040d4c044cd5ce2490350543100012499264984d55cea80189aba25001135573ca00226ea80048488c00800c888488ccc00401401000c80048c8c8cccd5cd19b875001480088c018dd71aba135573ca00646666ae68cdc3a80124000460106eb8d5d09aab9e500423500a35300b3357389201035054310000c499264984d55cea80089baa001212230020032122300100320011122232323333573466e1cd55cea80124000466aa01a600c6ae854008c014d5d09aba25002235007353008335738921035054310000949926135573ca00226ea800449848004800488848ccc00401000c0088004448848cc00400c008448004448c8c00400488cc00cc008008004cc88cc88ccc888ccc888cccccccc88888888cc88ccccc88888ccc888cccc8888cc88cc88cc88ccc888cc88ccc888cc88cc88cc88cc88cc88c8cc88888d4c010008c94cd4c09000440984cd5ce24812342656e65666963696172792773207369676e6174757265206e6f7420636f727265637400025332235300d002222222222253353502233355301212001335014225335350240022100310015023253353030333573466e3c0300040c80c44d40940045409000c840c840c0d4c02400488008d4c0ec00c888004480048004c8004c8c8c00400488cc00cc00800800488448894cd4d40400044d4d401800c88004884ccd4d402001488008c010008ccd54c01c4800401401000448848cc00400c008480048848cc00400c0088004888888888848cccccccccc00402c02802402001c01801401000c00880048848cc00400c008800488848ccc00401000c00880044488008488488cc00401000c480048848cc00400c008800448488c00800c44880044800448848cc00400c0084800448848cc00400c0084800448848cc00400c00848004484888c00c0104488800844888004480044880084880048004848888c010014848888c00c014848888c008014848888c00401480048848cc00400c0088004848888888c01c0208848888888cc018024020848888888c014020488888880104888888800c8848888888cc0080240208848888888cc00402402080048488c00800c888488ccc00401401000c80048488c00800c8488c00400c800488848ccc00401000c0088004448848cc00400c0084480041';
  // const scriptAddress =
  //   'addr_test1wqjr5lskcaue04l7r9jt09epsu7zfsyjwuulc7xguq8mlkgaymmzr';
  ////

  function toggleSelectedAssets(index, asset: Asset) {
    setSelectedAsset(asset.unit);
  }

  async function _getAssetUtxo({ scriptAddress, asset, datum }) {
    const blockfrost = new BlockfrostProvider(
      process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_TESTNET!,
      0
    );
    const dataHash = resolveDataHash(datum);
    console.log('dataHash', dataHash);
    const utxos = await blockfrost.fetchAssetUtxosFromAddress(
      asset,
      scriptAddress
    );
    console.log('utxos with this asset', utxos);
    console.log(
      'utxos with datumhash',
      utxos.filter((utxo: any) => {
        return utxo.output.dataHash == dataHash;
      })
    );
    // let filteredUtxo = utxos.find((utxo: any) => {
    //   return utxo.output.dataHash == dataHash;
    // });
    // return filteredUtxo;

    let filteredUtxo = utxos.filter((utxo: any) => {
      return utxo.output.dataHash == dataHash;
    });
    return filteredUtxo[0];
  }

  async function makeTransactionLockAsset() {
    // const datum = [
    //   [
    //     {
    //       v: '6164617065416c636f747452696368',
    //       k: 'a183bf86925f66c579a3745c9517744399679b090927b8f6e2f2e1bb',
    //     },
    //   ],
    //   [
    //     '9a4e855293a0b9af5e50935a331d83e7982ab5b738ea0e6fc0f9e656',
    //     '4652414d455f39393033345f4c30',
    //   ],
    //   'bea1c521df58f4eeef60c647e5ebd88c6039915409f9fd6454a476b9',
    // ];
    // const dataHash = resolveDataHash(datum);
    // console.log('dataHash', dataHash); //expect 013a908c2611ef2db05e99a670931453ec07116a7c8cd4cefcf44e1462b5c91f

    setState(1);
    try {
      const datum = 79600447942433; // expected 8fb8d1694f8180e8a59f23cce7a70abf0b3a92122565702529ff39baf01f87f1
      // const datum = [
      //   [
      //     'a183bf86925f66c579a3745c9517744399679b090927b8f6e2f2e1bb',
      //     '6164617065416c636f747452696368',
      //   ],
      //   [
      //     '9a4e855293a0b9af5e50935a331d83e7982ab5b738ea0e6fc0f9e656',
      //     '4652414d455f39393033345f4c30',
      //   ],
      //   'bea1c521df58f4eeef60c647e5ebd88c6039915409f9fd6454a476b8',
      // ];

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
      // const txHash = await wallet.submitTx(signedTx);
      
      const koios = new KoiosProvider(0);
      const txHash = await koios.submitTx(signedTx);
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
      // const datum = [
      //   [
      //     'a183bf86925f66c579a3745c9517744399679b090927b8f6e2f2e1bb',
      //     '6164617065416c636f747452696368',
      //   ],
      //   [
      //     '9a4e855293a0b9af5e50935a331d83e7982ab5b738ea0e6fc0f9e656',
      //     '4652414d455f39393033345f4c30',
      //   ],
      //   'bea1c521df58f4eeef60c647e5ebd88c6039915409f9fd6454a476b8',
      // ];

      const assetUtxo = await _getAssetUtxo({
        scriptAddress: scriptAddress,
        asset: selectedAsset,
        datum: datum,
      });
      console.log('selected utxo from script', assetUtxo);

      if (assetUtxo) {
        const tx = new TransactionService({ initiator: wallet });
        tx.redeemFromScript(assetUtxo, script, { datum: datum })
          .sendValue(await wallet.getChangeAddress(), assetUtxo)
          .sendLovelace(await wallet.getChangeAddress(), '3000000');

        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx, true);
        console.log('signedTx', signedTx);
        // const txHash = await wallet.submitTx(signedTx);

        const koios = new KoiosProvider(0);
        const txHash = await koios.submitTx(signedTx);
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
  let codeSnippet1 = `const datum = '${inputDatum}';\n`;
  codeSnippet1 += `const assets = [\n`;
  codeSnippet1 += `  {\n`;
  codeSnippet1 += `    unit: '${selectedAsset}',\n`;
  codeSnippet1 += `    quantity: '1',\n`;
  codeSnippet1 += `  }\n`;
  codeSnippet1 += `];\n\n`;

  codeSnippet1 += `const tx = new TransactionService({ walletService: wallet })\n`;
  codeSnippet1 += `  .sendAssets(\n`;
  codeSnippet1 += `    '${scriptAddress}', // SCRIPT ADDRESS HERE\n`;
  codeSnippet1 += `    assets,\n`;
  codeSnippet1 += `    { datum: datum }\n`;
  codeSnippet1 += `  );\n\n`;

  codeSnippet1 += `const unsignedTx = await tx.build();\n`;
  codeSnippet1 += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet1 += `const txHash = await wallet.submitTx(signedTx);`;

  // codeSnippet2
  let codeSnippet2 = `import { resolveDataHash, BlockfrostProvider } from '@martifylabs/mesh';\n\n`;

  codeSnippet2 += `// this function fetch the UTXO from the script address\n`;
  codeSnippet2 += `async function getAssetUtxo({ scriptAddress, asset, datum }) {\n`;
  codeSnippet2 += `  const blockfrost = new BlockfrostProvider(\n`;
  codeSnippet2 += `    'BLOCKFROST_API_KEY_HERE',\n`;
  codeSnippet2 += `    'testnet'\n`;
  codeSnippet2 += `  );\n`;
  codeSnippet2 += `  const dataHash = resolveDataHash(datum);\n`;
  codeSnippet2 += `  const utxos = await blockfrost.fetchAssetUtxosFromAddress(\n`;
  codeSnippet2 += `    asset,\n`;
  codeSnippet2 += `    scriptAddress\n`;
  codeSnippet2 += `  );\n`;
  codeSnippet2 += `  let filteredUtxo = utxos.find((utxo: any) => {\n`;
  codeSnippet2 += `    return utxo.output.dataHash == dataHash;\n`;
  codeSnippet2 += `  });\n`;
  codeSnippet2 += `  return filteredUtxo;\n`;
  codeSnippet2 += `}\n\n`;

  codeSnippet2 += `const script = '${script}'; // SCRIPT CBOR HERE\n`;
  codeSnippet2 += `const datum = '${inputDatum}';\n`;
  codeSnippet2 += `const assetUtxo = await getAssetUtxo(\n`;
  codeSnippet2 += `  '${scriptAddress}',\n`;
  codeSnippet2 += `  '${
    selectedAsset.length > 0 ? selectedAsset : 'ASSET UNIT HERE'
  }'`;
  codeSnippet2 += `\n  datum\n`;
  codeSnippet2 += `);\n\n`;

  codeSnippet2 += `const tx = new TransactionService({ walletService: wallet })\n`;
  codeSnippet2 += `  .redeemFromScript(\n`;
  codeSnippet2 += `    assetUtxo, \n`;
  codeSnippet2 += `    script, \n`;
  codeSnippet2 += `    { datum: datum }\n`;
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
        for locking. Lastly, define a code to create the datum, the same datum
        hash must be provided to unlock the asset.
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
          <tr>
            <td className="py-4 px-4 w-1/4">Datum</td>
            <td className="py-4 px-4 w-3/4">
              <Input
                value={inputDatum}
                onChange={(e) => setInputDatum(e.target.value)}
                placeholder="a secret code to create datum"
              />
            </td>
          </tr>
        </tbody>
      </table>

      <Codeblock data={codeSnippet1} isJson={false} />

      {walletConnected ? (
        <Button
          onClick={() => makeTransactionLockAsset()}
          disabled={state == 1}
          style={state == 1 ? 'warning' : state == 2 ? 'success' : 'light'}
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
              <tr>
                <td className="py-4 px-4 w-1/4">Datum</td>
                <td className="py-4 px-4 w-3/4">
                  <Input
                    value={inputDatum}
                    onChange={(e) => setInputDatum(e.target.value)}
                    placeholder="that secret code to unlock"
                  />
                </td>
              </tr>
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
