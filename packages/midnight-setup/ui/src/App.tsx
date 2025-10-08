import { useMidnightWallet } from "./hookes/useMidnightWallet";
import { useDeployedContract } from "./providers/DeployedContractProvider";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Badge } from "./components/ui/badge";
import { Wallet, Loader2, CheckCircle, AlertCircle, Database, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { ContractStateData, LedgerStateData } from "@meshsdk/midnight-setup";

// Helper to safely stringify unknown data
const safeStringify = (data: unknown): string => {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return "Unable to display data";
  }
};

function App() {
  const walletContext = useMidnightWallet();
  const contractContext = useDeployedContract();
  const [contractAddress, setContractAddress] = useState("");
  const [contractState, setContractState] = useState<ContractStateData | null>(null);
  const [ledgerState, setLedgerState] = useState<LedgerStateData | null>(null);
  const [isLoadingState, setIsLoadingState] = useState(false);

  const handleJoinContract = async () => {
    if (contractAddress.trim()) {
      await contractContext.onJoinContract(contractAddress.trim());
    }
  };

  const handleDeployContract = async () => {
    await contractContext.onDeployContract();
  };

  const handleGetContractState = async () => {
    if (!contractContext.midnightSetupApi) return;
    
    setIsLoadingState(true);
    try {
      const state = await contractContext.midnightSetupApi.getContractState();
      setContractState(state);
    } catch (error) {
      console.error("Failed to get contract state:", error);
    } finally {
      setIsLoadingState(false);
    }
  };

  const handleGetLedgerState = async () => {
    if (!contractContext.midnightSetupApi) return;
    
    setIsLoadingState(true);
    try {
      const state = await contractContext.midnightSetupApi.getLedgerState();
      setLedgerState(state);
    } catch (error) {
      console.error("Failed to get ledger state:", error);
    } finally {
      setIsLoadingState(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Midnight Setup
          </h1>
          <p className="text-gray-600">
            Connect your wallet, deploy or join contracts, view contract and ledger states, check your API, access your contract address and functions — all in one place. Modify as you like and just build!
          </p>
        </div>

        {/* Wallet Connection Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Wallet Connection
            </CardTitle>
            <CardDescription>
              Connect to your Midnight wallet to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            {walletContext?.walletState.hasConnected ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge className="gap-2 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-3 py-1">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                    Connected: {walletContext.walletState.address?.slice(0, 6)}...
                    {walletContext.walletState.address?.slice(-4)}
                  </Badge>
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                </div>
                <Button
                  variant="outline"
                  onClick={walletContext.disconnect}
                  disabled={walletContext.walletState.isConnecting}
                >
                  Disconnect
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-600">
                  <AlertCircle className="w-5 h-5" />
                  Wallet not connected
                </div>
                <Button
                  onClick={walletContext?.connectToWalletAndInitializeProviders}
                  disabled={walletContext?.walletState.isConnecting}
                  className="gap-2"
                >
                  <Wallet className="w-4 h-4" />
                  {walletContext?.walletState.isConnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    "Connect Wallet"
                  )}
                </Button>
              </div>
            )}
            
            {walletContext?.walletState.error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-600 text-sm">{walletContext.walletState.error}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={walletContext.clearError}
                  className="mt-2 text-red-600 hover:text-red-700"
                >
                  Clear Error
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contract Operations Section */}
        {walletContext?.walletState.hasConnected && (
          <Card>
            <CardHeader>
              <CardTitle>Contract Operations</CardTitle>
              <CardDescription>
                Deploy a new contract or join an existing one
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Deploy Contract */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Deploy New Contract</h3>
                <div className="flex items-center gap-4">
                  <Button
                    onClick={handleDeployContract}
                    disabled={contractContext.isDeploying || contractContext.hasDeployed}
                    className="gap-2"
                  >
                    {contractContext.isDeploying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Deploying...
                      </>
                    ) : (
                      "Deploy Contract"
                    )}
                  </Button>
                  {contractContext.hasDeployed && (
                    <div className="flex items-center gap-2 text-emerald-600">
                      <CheckCircle className="w-5 h-5" />
                      <span>Contract deployed at: {contractContext.deployedContractAddress}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Join Contract */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Join Existing Contract</h3>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <Label htmlFor="contract-address">Contract Address</Label>
                    <Input
                      id="contract-address"
                      placeholder="Enter contract address..."
                      value={contractAddress}
                      onChange={(e) => setContractAddress(e.target.value)}
                      disabled={contractContext.isJoining}
                    />
                  </div>
                  <Button
                    onClick={handleJoinContract}
                    disabled={contractContext.isJoining || contractContext.hasJoined || !contractAddress.trim()}
                    className="gap-2"
                  >
                    {contractContext.isJoining ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Joining...
                      </>
                    ) : (
                      "Join Contract"
                    )}
                  </Button>
                </div>
                {contractContext.hasJoined && (
                  <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle className="w-5 h-5" />
                    <span>Successfully joined contract at: {contractContext.deployedContractAddress}</span>
                  </div>
                )}
              </div>

              {/* Error Display */}
              {contractContext.error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-red-600 text-sm">{contractContext.error}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={contractContext.clearError}
                    className="mt-2 text-red-600 hover:text-red-700"
                  >
                    Clear Error
                  </Button>
                </div>
              )}

              {/* Contract Status */}
              {(contractContext.hasDeployed || contractContext.hasJoined) && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-md">
                  <h4 className="font-semibold text-emerald-800 mb-2">Contract Status</h4>
                  <div className="space-y-2 text-sm text-emerald-700">
                    <p><strong>Status:</strong> {contractContext.hasDeployed ? "Deployed" : "Joined"}</p>
                    <p><strong>Address:</strong> {contractContext.deployedContractAddress}</p>
                    <p><strong>API Available:</strong> {contractContext.midnightSetupApi ? "Yes" : "No"}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Contract State Reading Section */}
        {(contractContext.hasDeployed || contractContext.hasJoined) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Contract State Reader
              </CardTitle>
              <CardDescription>
                Read and display the current state of the deployed contract
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-4">
                <Button
                  onClick={handleGetContractState}
                   disabled={isLoadingState || !contractContext.midnightSetupApi}
                  className="gap-2"
                >
                  {isLoadingState ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Get Contract State
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleGetLedgerState}
                   disabled={isLoadingState || !contractContext.midnightSetupApi}
                  variant="outline"
                  className="gap-2"
                >
                  {isLoadingState ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4" />
                      Get Ledger State
                    </>
                  )}
                </Button>
              </div>

              {/* Contract State Display */}
              {contractState && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                  <h4 className="font-semibold text-blue-800 mb-2">Contract State</h4>
                  <div className="space-y-2 text-sm">
                    <p><strong>Address:</strong> {contractState.address}</p>
                    {contractState.blockHeight && (
                      <p><strong>Block Height:</strong> {contractState.blockHeight}</p>
                    )}
                    {contractState.blockHash && (
                      <p><strong>Block Hash:</strong> {contractState.blockHash}</p>
                    )}
                    {contractState.error && (
                      <p className="text-red-600"><strong>Error:</strong> {contractState.error}</p>
                    )}
                    {contractState.message && (
                      <p className="text-yellow-600"><strong>Message:</strong> {contractState.message}</p>
                    )}
                    {contractState.data !== null && contractState.data !== undefined ? (
                      <div>
                        <p><strong>Raw Data:</strong></p>
                        <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-40">
                          {safeStringify(contractState.data)}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Ledger State Display */}
              {ledgerState && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                  <h4 className="font-semibold text-green-800 mb-2">Ledger State</h4>
                  <div className="space-y-2 text-sm">
                    <p><strong>Address:</strong> {ledgerState.address}</p>
                    {ledgerState.blockHeight && (
                      <p><strong>Block Height:</strong> {ledgerState.blockHeight}</p>
                    )}
                    {ledgerState.blockHash && (
                      <p><strong>Block Hash:</strong> {ledgerState.blockHash}</p>
                    )}
                    {ledgerState.error && (
                      <p className="text-red-600"><strong>Error:</strong> {ledgerState.error}</p>
                    )}
                    {ledgerState.parseError && (
                      <p className="text-orange-600"><strong>Parse Error:</strong> {ledgerState.parseError}</p>
                    )}
                    {ledgerState.ledgerState && (
                      <div>
                        {ledgerState.ledgerState.message && (
                          <p><strong>Message:</strong> {ledgerState.ledgerState.message}</p>
                        )}
                        <div className="mt-2">
                          <p><strong>Parsed Data:</strong></p>
                          <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-40">
                            {JSON.stringify(ledgerState.ledgerState, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                    {ledgerState.rawData !== null && ledgerState.rawData !== undefined ? (
                      <div>
                        <p><strong>Raw Data (could not parse):</strong></p>
                        <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-40">
                          {safeStringify(ledgerState.rawData)}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Footer Banner - Powered by MeshJS Team */}
        <div className="mt-12 py-8 border-t border-gray-200">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="flex items-center space-x-3">
              <a 
                href="https://github.com/MeshJS" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
              >
                <img 
                  src="/mesh-logo.svg" 
                  alt="MeshJS Logo" 
                  className="h-8 w-8 object-contain"
                />
                <p className="text-gray-600 text-sm font-medium">
                  Powered by <span className="text-blue-600 font-semibold hover:underline">MeshJS Team</span>
                </p>
              </a>
            </div>
            <p className="text-gray-400 text-xs">
              Built with ❤️ on Midnight Network
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;