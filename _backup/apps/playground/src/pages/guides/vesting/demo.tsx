import { VestingDepositFundDemo } from "../../smart-contracts/vesting/deposit-fund";
import { VestingWithdrawFundDemo } from "../../smart-contracts/vesting/withdraw-fund";

export default function Demo() {
  return (
    <>
      <VestingDepositFundDemo />
      <VestingWithdrawFundDemo />
    </>
  );
}
