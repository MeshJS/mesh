import { CSLSerializer } from "./packages/mesh-core-csl/src/core/serializer";
import { MeshTxBuilderBody, emptyTxBuilderBody, Certificate, DEFAULT_PROTOCOL_PARAMETERS } from "./packages/mesh-common/src/index";

async function runTests() { 
  const body: MeshTxBuilderBody = emptyTxBuilderBody();
  body.changeAddress = "addr_test1qr3a9rrclgf9rx90lmll2qnfzfwgrw35ukvgjrk36pmlzu0jemqwylc286744g0tnqkrvu0dkl8r48k0upkfmg7mncpqf0672w";
  
  const cert: Certificate = {
    type: "ScriptCertificate",
    certType: {
      type: "RegisterStake",
      stakeKeyAddress: "stake_test17ryje2rawy9d7m2fwn4nrxgch8st3anccre32g885gu232snvhvu7",
    },
    redeemer: {
      data: { type: "Mesh", content: [] },
      exUnits: { mem: 1000000, steps: 1000000 }
    },
    scriptSource: {
      type: "Inline",
      txHash: "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
      txIndex: 0,
      scriptHash: "e3d28c78fa125198affefff50269125c81ba34e598890ed1d077f171",
      scriptSize: "1234"
    }
  };
  body.certificates.push(cert);
  
  const cslSerializer = new CSLSerializer(DEFAULT_PROTOCOL_PARAMETERS as any);
  let builtTxHex = "";
  try {
    builtTxHex = cslSerializer.serializeTxBody(body);
    console.log("SUCCESS! CSL serializeTxBody successfully compiled.");
    console.log("Tx Hex Output:", builtTxHex);
  } catch (e: any) {
    console.log("FAILED! CSL serializeTxBody threw:", e.message);
  }
}

runTests();
