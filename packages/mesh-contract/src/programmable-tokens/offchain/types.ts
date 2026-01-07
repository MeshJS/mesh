export type RegistryDatum = {
    key: string;
    next: any;
    transferScriptHash: string;
    thirdPartyScriptHash: string;
    metadata: any;
  };
  
  export type TxInput = {
      txHash: string;
      outputIndex: number;
    };
    
    export type ProtocolParams = {
      txInput: TxInput;
      scriptHash: string;
    };
    
    export type ProgrammableLogicGlobalParams = {
      protocolParamsScriptHash: string;
      scriptHash: string;
    };
    
    export type ProgrammableLogicBaseParams = {
      programmableLogicGlobalScriptHash: string;
      scriptHash: string;
    };
    
    export type IssuanceParams = {
      txInput: TxInput;
      scriptHash: string;
    };
    
    export type DirectoryMintParams = {
      txInput: TxInput;
      issuanceScriptHash: string;
      scriptHash: string;
    };
    
    export type DirectorySpendParams = {
      protocolParamsPolicyId: string;
      scriptHash: string;
    };
    
    export type ProtocolBootstrapParams = {
      protocolParams: ProtocolParams;
      programmableLogicGlobalPrams: ProgrammableLogicGlobalParams;
      programmableLogicBaseParams: ProgrammableLogicBaseParams;
      issuanceParams: IssuanceParams;
      directoryMintParams: DirectoryMintParams;
      directorySpendParams: DirectorySpendParams;
      programmableBaseRefInput: TxInput;
      programmableGlobalRefInput: TxInput;
      txHash: string;
    };