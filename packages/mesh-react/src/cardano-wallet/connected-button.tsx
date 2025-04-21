import { Button } from "../common/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../common/dropdown-menu";
import { useWallet } from "../hooks";

export default function ConnectedButton() {
  const { name, disconnect, address } = useWallet();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          {address.slice(0, 6)}...{address.slice(-6)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Wallet</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => {
            navigator.clipboard.writeText(address);
          }}
        >
          Copy Address
        </DropdownMenuItem>
        {name == "Mesh Web3 Services" && (
          <DropdownMenuItem
            onClick={() => {
              window.open("https://web3.meshjs.dev/dashboard", "_blank");
            }}
          >
            Open Web3 Wallet
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            disconnect();
          }}
        >
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
