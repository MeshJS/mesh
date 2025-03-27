import { CardanoWallet } from "@meshsdk/react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <>
      <div className="mb-20">
        <CardanoWallet />
      </div>

      <div>
        <Button>Button</Button>
        <Button variant="outline">Button outline</Button>
        <Button variant="destructive">Button destructive</Button>
      </div>
    </>
  );
}
