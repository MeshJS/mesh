import { useEffect, useState } from 'react';
import { useWallet } from '@meshsdk/react';
import {
  Transaction,
  resolvePaymentKeyHash,
  resolvePlutusScriptAddress,
  resolveDataHash,
} from '@meshsdk/core';
import type { Data, PlutusScript } from '@meshsdk/core';

export default function useMarketplaceV1({ blockchainFetcher, network = 0 }) {
  const scriptCbor =
    '590d74590d7101000033232323232323232323232323233223232323232223232323223223232533533300b3333573466e1cd55cea804a400046666444424666600200a0080060046eb8d5d0a8049bad35742a0106eb8d5d0a8039bae357426ae89401c8c98c8078cd5ce00f80f00e1999ab9a3370ea0089001109100091999ab9a3370ea00a9000109100111931900f99ab9c02001f01d01c3333573466e1cd55cea80124000466442466002006004646464646464646464646464646666ae68cdc39aab9d500c480008cccccccccccc88888888888848cccccccccccc00403403002c02802402001c01801401000c008cd406c070d5d0a80619a80d80e1aba1500b33501b01d35742a014666aa03eeb94078d5d0a804999aa80fbae501e35742a01066a03604c6ae85401cccd5407c09dd69aba150063232323333573466e1cd55cea801240004664424660020060046464646666ae68cdc39aab9d5002480008cc8848cc00400c008cd40c5d69aba150023032357426ae8940088c98c80d0cd5ce01a81a01909aab9e5001137540026ae854008c8c8c8cccd5cd19b8735573aa004900011991091980080180119a818bad35742a00460646ae84d5d1280111931901a19ab9c035034032135573ca00226ea8004d5d09aba2500223263203033573806206005c26aae7940044dd50009aba1500533501b75c6ae854010ccd5407c08c8004d5d0a801999aa80fbae200135742a004604a6ae84d5d1280111931901619ab9c02d02c02a135744a00226ae8940044d5d1280089aba25001135744a00226ae8940044d5d1280089aba25001135744a00226ae8940044d55cf280089baa00135742a004602a6ae84d5d1280111931900f19ab9c01f01e01c101d13263201d335738921035054350001d135573ca00226ea80044d55ce9baa001135744a00226ae8940044d55cf280089baa0011232230023758002640026aa028446666aae7c004940288cd4024c010d5d080118019aba2002014232323333573466e1cd55cea8012400046644246600200600460186ae854008c014d5d09aba2500223263201433573802a02802426aae7940044dd50009191919191999ab9a3370e6aae75401120002333322221233330010050040030023232323333573466e1cd55cea80124000466442466002006004602a6ae854008cd403c050d5d09aba2500223263201933573803403202e26aae7940044dd50009aba150043335500875ca00e6ae85400cc8c8c8cccd5cd19b875001480108c84888c008010d5d09aab9e500323333573466e1d4009200223212223001004375c6ae84d55cf280211999ab9a3370ea00690001091100191931900d99ab9c01c01b019018017135573aa00226ea8004d5d0a80119a805bae357426ae8940088c98c8054cd5ce00b00a80989aba25001135744a00226aae7940044dd5000899aa800bae75a224464460046eac004c8004d5404488c8cccd55cf80112804119a8039991091980080180118031aab9d5002300535573ca00460086ae8800c0484d5d080088910010910911980080200189119191999ab9a3370ea0029000119091180100198029aba135573ca00646666ae68cdc3a801240044244002464c6402066ae700440400380344d55cea80089baa001232323333573466e1d400520062321222230040053007357426aae79400c8cccd5cd19b875002480108c848888c008014c024d5d09aab9e500423333573466e1d400d20022321222230010053007357426aae7940148cccd5cd19b875004480008c848888c00c014dd71aba135573ca00c464c6402066ae7004404003803403002c4d55cea80089baa001232323333573466e1cd55cea80124000466442466002006004600a6ae854008dd69aba135744a004464c6401866ae700340300284d55cf280089baa0012323333573466e1cd55cea800a400046eb8d5d09aab9e500223263200a33573801601401026ea80048c8c8c8c8c8cccd5cd19b8750014803084888888800c8cccd5cd19b875002480288488888880108cccd5cd19b875003480208cc8848888888cc004024020dd71aba15005375a6ae84d5d1280291999ab9a3370ea00890031199109111111198010048041bae35742a00e6eb8d5d09aba2500723333573466e1d40152004233221222222233006009008300c35742a0126eb8d5d09aba2500923333573466e1d40192002232122222223007008300d357426aae79402c8cccd5cd19b875007480008c848888888c014020c038d5d09aab9e500c23263201333573802802602202001e01c01a01801626aae7540104d55cf280189aab9e5002135573ca00226ea80048c8c8c8c8cccd5cd19b875001480088ccc888488ccc00401401000cdd69aba15004375a6ae85400cdd69aba135744a00646666ae68cdc3a80124000464244600400660106ae84d55cf280311931900619ab9c00d00c00a009135573aa00626ae8940044d55cf280089baa001232323333573466e1d400520022321223001003375c6ae84d55cf280191999ab9a3370ea004900011909118010019bae357426aae7940108c98c8024cd5ce00500480380309aab9d50011375400224464646666ae68cdc3a800a40084244400246666ae68cdc3a8012400446424446006008600c6ae84d55cf280211999ab9a3370ea00690001091100111931900519ab9c00b00a008007006135573aa00226ea80048c8cccd5cd19b8750014800884880088cccd5cd19b8750024800084880048c98c8018cd5ce00380300200189aab9d37540029309000a48103505431001123230010012233003300200200132323232332232323233223232332232323232323232323232332232323222232533500313301c3301249010131003301a33300f3300550015335323500122222222222200450011622153350011002221635004222200235004222200148008cc070cc0492410132003232333573466e2000800407c080d4014888800cccc03ccc0154004c05801006c06ccc0492410133003301a32333355300c12001323350132233350110030010023500e00133501222230033002001200122337000029001000a4000664464600266aa60342400246a00244002646a002444444444444018a008640026aa04844a66a002200644264a66a64646a004446a006446466a00a466a0084a66a666ae68cdc78010008170168a80188169016919a80210169299a999ab9a3371e00400205c05a2a006205a2a66a00642a66a0044266a004466a004466a004466a0044660420040024060466a004406046604200400244406044466a0084060444a66a666ae68cdc38030018198190a99a999ab9a3370e00a00406606426605e0080022064206420562a66a002420562056664424660020060046424460020066aa66a6a014446a0044444444444446666a01a4a0564a0564a0564666aa604424002a04e46a00244a66aa66a666ae68cdc79a801110011a8021100101c01b8999ab9a3370e6a004440026a0084400207006e206e26a05e0062a05c01a426a002446a00244446a0084466a0044606493119aa8198008028981424c44004a0386a006444400826600e00600220026008002a030a03290010998092481013400323235002222222222222533533355301912001501e25335333573466e3c0380040b40b04d40900045408c010840b440acc05c014c04c0084c04800488ccd54c0104800488cd54c024480048d400488cd5408c008cd54c030480048d400488cd54098008ccd40048cc0952000001223302600200123302500148000004cd54c024480048d400488cd5408c008ccd40048cd54c034480048d400488cd5409c008d5403c00400488ccd5540280480080048cd54c034480048d400488cd5409c008d54038004004ccd5540140340080054058d4008888888888888ccd54c0404800488d40088888d401088cd400894cd4ccd5cd19b8f01600103002f133502a00600810082008502200a111222333553004120015015335530071200123500122335502100235500900133355300412001223500222533533355300c120013233501322333500322002002001350012200112330012253350021022100101f235001223300a002005006100313350190040035016001335530071200123500122323355022003300100532001355022225335001135500a003221350022253353300c002008112223300200a004130060030023200135501b2211222533500110022213300500233355300712001005004001112122230030041121222300100432001355018221122533500115013221335014300400233553006120010040013200135501722112225335001135006003221333500900530040023335530071200100500400112350012200112350012200222333573466e3c008004048044888c8c8c004014c8004d5405c88cd400520002235002225335333573466e3c0080240640604c01c0044c01800cc8004d5405888cd400520002235002225335333573466e3c00801c06005c40044c01800c4cd4004894cd40088400c4005401048848cc00400c008894cd400440384cd5ce00100691a80091001090911801001889100091a8009111002190009aa805910891299a8008a80311099a803980200119aa98030900080200088910010910911980080200191199ab9a3370e00400200c00a910100225335002100110031220021220012233700004002464c649319ab9c4901024c67001200111221233001003002112323001001223300330020020011';

  const { connected, wallet } = useWallet();
  const [scriptAddress, setScriptAddress] = useState('');
  const [script, setScript] = useState({});

  useEffect(() => {
    const _script: PlutusScript = {
      code: scriptCbor,
      version: 'V2',
    };
    setScript(_script);
    const _scriptAddress = resolvePlutusScriptAddress(_script, network);
    setScriptAddress(_scriptAddress);
  }, []);

  async function checkWallet() {
    if (!connected) {
      throw 'Wallet not connected';
    }
    const walletNetwork = await wallet.getNetworkId();
    if (walletNetwork !== network) {
      throw 'Wallet wrong network';
    }
  }

  async function _getAssetUtxo({ scriptAddress, asset, datum }) {
    const utxos = await blockchainFetcher.fetchAddressUTxOs(
      scriptAddress,
      asset
    );
    if (utxos.length == 0) {
      throw 'No listing found.';
    }
    const dataHash = resolveDataHash(datum);
    let utxo = utxos.find((utxo: any) => {
      return utxo.output.dataHash == dataHash;
    });
    return utxo;
  }

  async function listAsset({
    policyId,
    assetId,
    listPriceInLovelace,
    quantity,
  }: {
    policyId: string;
    assetId: string;
    listPriceInLovelace: number;
    quantity: number | string;
  }) {
    await checkWallet();

    const addr = (await wallet.getUsedAddresses())[0];
    const datumConstr: Data = {
      alternative: 0,
      fields: [
        resolvePaymentKeyHash(addr),
        listPriceInLovelace,
        policyId,
        assetId,
      ],
    };
    const tx = new Transaction({ initiator: wallet }).sendAssets(
      {
        address: scriptAddress,
        datum: {
          value: datumConstr,
        },
      },
      [
        {
          unit: `${policyId}${assetId}`,
          quantity: quantity.toString(),
        },
      ]
    );
    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  async function cancelListing({
    policyId,
    assetId,
    listPriceInLovelace,
  }: {
    policyId: string;
    assetId: string;
    listPriceInLovelace: number;
  }) {
    console.log('cancelListing', policyId, assetId, listPriceInLovelace);
    const addr = (await wallet.getUsedAddresses())[0];
    const datumConstr: Data = {
      alternative: 0,
      fields: [
        resolvePaymentKeyHash(addr),
        listPriceInLovelace,
        policyId,
        assetId,
      ],
    };
    const redeemer = { data: { alternative: 1, fields: [] } };
    if (wallet) {
      const assetUtxo = await _getAssetUtxo({
        scriptAddress: scriptAddress,
        asset: `${policyId}${assetId}`,
        datum: datumConstr,
      });

      const tx = new Transaction({ initiator: wallet })
        .redeemValue({
          value: assetUtxo,
          script: script,
          datum: datumConstr,
          redeemer: redeemer,
        })
        .sendValue(addr, assetUtxo)
        .setRequiredSigners([addr]);

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx, true);
      const txHash = await wallet.submitTx(signedTx);
      return txHash;
    }
  }

  async function buyAsset({
    policyId,
    assetId,
    listPriceInLovelace,
    sellerAddr,
  }: {
    policyId: string;
    assetId: string;
    listPriceInLovelace: number;
    sellerAddr: string;
  }) {
    const addr = (await wallet.getUsedAddresses())[0]; // Buyer's address
    const datumConstr: Data = {
      alternative: 0,
      fields: [
        resolvePaymentKeyHash(sellerAddr),
        listPriceInLovelace,
        policyId,
        assetId,
      ],
    };
    const redeemer = { data: { alternative: 0, fields: [] } };
    if (wallet) {
      const assetUtxo = await _getAssetUtxo({
        scriptAddress: scriptAddress,
        asset: `${policyId}${assetId}`,
        datum: datumConstr,
      });
      const tx = new Transaction({ initiator: wallet })
        .redeemValue({
          value: assetUtxo,
          script: script,
          datum: datumConstr,
          redeemer: redeemer,
        })
        .sendValue(addr, assetUtxo)
        .sendLovelace(sellerAddr, listPriceInLovelace.toString())
        .setRequiredSigners([addr]);

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx, true);
      const txHash = await wallet.submitTx(signedTx);
      return txHash;
    }
  }

  async function updateListing({
    policyId,
    assetId,
    listPriceInLovelace,
    quantity,
    updatedPriceInLovelace,
  }: {
    policyId: string;
    assetId: string;
    listPriceInLovelace: number;
    quantity: number | string;
    updatedPriceInLovelace: number;
  }) {
    console.log('updateListing', policyId, assetId, listPriceInLovelace);
    const addr = (await wallet.getUsedAddresses())[0];
    const datumConstr: Data = {
      alternative: 0,
      fields: [
        resolvePaymentKeyHash(addr),
        listPriceInLovelace,
        policyId,
        assetId,
      ],
    };
    const datumConstrNew: Data = {
      alternative: 0,
      fields: [
        resolvePaymentKeyHash(addr),
        updatedPriceInLovelace,
        policyId,
        assetId,
      ],
    };
    if (wallet) {
      const redeemer = { data: { alternative: 1, fields: [] } };
      const assetUtxo = await _getAssetUtxo({
        scriptAddress: scriptAddress,
        asset: `${policyId}${assetId}`,
        datum: datumConstr,
      });

      const tx = new Transaction({ initiator: wallet })
        .redeemValue({
          value: assetUtxo,
          script: script,
          datum: datumConstr,
          redeemer: redeemer,
        })
        .setRequiredSigners([addr])
        .sendAssets(
          {
            address: scriptAddress,
            datum: {
              value: datumConstrNew,
            },
          },
          [
            {
              unit: `${policyId}${assetId}`,
              quantity: quantity.toString(),
            },
          ]
        );

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx, true);
      const txHash = await wallet.submitTx(signedTx);
      return txHash;
    }
  }

  return { listAsset, buyAsset, updateListing, cancelListing };
}
