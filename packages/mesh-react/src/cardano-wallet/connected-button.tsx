import { Button } from "../common/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  // DropdownMenuLabel,
  // DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../common/dropdown-menu";
import { useWallet } from "../hooks";

export default function ConnectedButton() {
  const { wallet, connected, disconnect, address } = useWallet();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          {address.slice(0, 6)}...{address.slice(-6)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {/* <DropdownMenuLabel>Wallet</DropdownMenuLabel>
        <DropdownMenuSeparator /> */}
        <DropdownMenuItem
          onClick={() => {
            navigator.clipboard.writeText(address);
          }}
        >
          Copy Address
        </DropdownMenuItem>
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
