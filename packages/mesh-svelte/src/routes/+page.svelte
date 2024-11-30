<script lang="ts">
  import { BrowserWalletState } from "$lib";

  $effect(() => {
    console.log(BrowserWalletState.browserWallet);
  });
</script>
