<script lang="ts">
  import { Dialog, Label, Separator } from "bits-ui";
  import { onMount } from "svelte";

  import type { Wallet } from "@meshsdk/core";
  import { BrowserWallet } from "@meshsdk/core";

  import { type CardanoWalletButtonProps } from "../../common";
  import { BrowserWalletState, connect, disconnect } from "../../state";

  const {
    label = "Connect Wallet",
    onConnected,
    isDark = true,
    metamask = undefined,
    extensions = [],
  }: CardanoWalletButtonProps = $props();

  let availableWallets: Wallet[] = $state([]);
  let dialogOpen: boolean = $state(false);

  onMount(() => {
    BrowserWallet.getAvailableWallets().then((aw) => {
      availableWallets = aw;
    });
  });

  let hideMenuList: boolean = $state(true);

  let lovelaceBalance: string | undefined = $state();

  $effect(() => {
    if (BrowserWalletState.connected === true && onConnected) {
      onConnected();
    }
  });

  $effect(() => {
    if (BrowserWalletState.wallet) {
      BrowserWalletState.wallet.getLovelace().then((l) => {
        lovelaceBalance = l;
      });
    }
  });
</script>

<Dialog.Root bind:open={dialogOpen}>
  {#if BrowserWalletState.connecting}
    Connecting...
  {:else if BrowserWalletState.wallet === undefined}
    <Dialog.Trigger
      class={`mesh-inline-flex mesh-items-center mesh-justify-center mesh-whitespace-nowrap mesh-rounded-md mesh-text-sm mesh-font-medium mesh-transition-colors focus-visible:mesh-outline-none focus-visible:mesh-ring-1 focus-visible:mesh-ring-zinc-950 disabled:mesh-pointer-events-none disabled:mesh-opacity-50 mesh-h-9 mesh-px-4 mesh-py-2 hover:mesh-bg-zinc-300 ${isDark === true ? "mesh-bg-neutral-950 mesh-text-neutral-50" : "mesh-bg-neutral-50 mesh-text-neutral-950 "}`}
    >
      {label}
    </Dialog.Trigger>
  {:else if BrowserWalletState.wallet && BrowserWalletState.wallet && lovelaceBalance}
    <button
      class={`mesh-inline-flex mesh-items-center mesh-justify-center mesh-whitespace-nowrap mesh-rounded-md mesh-text-sm mesh-font-medium mesh-transition-colors focus-visible:mesh-outline-none focus-visible:mesh-ring-1 focus-visible:mesh-ring-zinc-950 disabled:mesh-pointer-events-none disabled:mesh-opacity-50 mesh-h-9 mesh-px-4 mesh-py-2 hover:mesh-bg-zinc-300 ${isDark === true ? "mesh-bg-neutral-950 mesh-text-neutral-50" : "mesh-bg-neutral-50 mesh-text-neutral-950 "}`}
      onclick={() => disconnect()}
    >
      <img
        alt="Wallet Icon"
        class="mesh-m-2 mesh-h-6"
        src={BrowserWalletState.icon}
      />₳{" "}
      {parseInt((parseInt(lovelaceBalance, 10) / 1_000_000).toString(), 10)}.
      <span class="mesh-text-xs"
        >{lovelaceBalance.substring(lovelaceBalance.length - 6)}</span
      >
    </button>
  {:else if BrowserWalletState.wallet && BrowserWalletState.wallet && lovelaceBalance === undefined}
    Loading...
  {/if}
  <Dialog.Portal>
    <Dialog.Overlay
      class="mesh-fixed mesh-inset-0 mesh-z-50 mesh-bg-black/80"
    />
    <Dialog.Content
      class={`mesh-fixed mesh-left-[50%] mesh-top-[50%] mesh-z-50 mesh-w-full mesh-max-w-[94%] mesh-translate-x-[-50%] mesh-translate-y-[-50%] mesh-rounded-card-lg mesh-border mesh-rounded-xl ${isDark === true ? "mesh-bg-neutral-950 mesh-text-neutral-50" : "mesh-bg-neutral-50 mesh-text-neutral-950"} mesh-p-5 mesh-shadow-popover mesh-outline-none sm:mesh-max-w-[490px] md:mesh-w-full`}
    >
      <Dialog.Title
        class="mesh-flex mesh-w-full mesh-items-center mesh-justify-center mesh-text-lg mesh-font-semibold mesh-tracking-tight"
        >Create API key</Dialog.Title
      >
      <Separator.Root
        class={`mesh-mx-10 mesh-mb-6 mesh-mt-5 mesh-block mesh-h-px ${isDark === true ? "mesh-bg-neutral-50" : "mesh-bg-neutral-950"}`}
      />
      <Dialog.Description
        class="mesh-text-sm mesh-text-center mesh-text-foreground-alt"
      >
        Securely Connect your Cardano Wallet.
      </Dialog.Description>
      <div
        class="mesh-grid mesh-gap-4 mesh-grid-cols-2 mesh-mt-5 mesh-mb-5 mesh-place-items-center"
      >
        {#each availableWallets as wallet}
          <img
            class="mesh-w-32 mesh-h-32 hover:mesh-cursor-pointer"
            alt={wallet.name + " icon"}
            src={wallet.icon}
            onclick={() => {
              connect(wallet);
              dialogOpen = false;
            }}
          />
        {/each}
      </div>
      <Dialog.Close
        class="mesh-absolute mesh-right-5 mesh-top-5 mesh-rounded-md focus-visible:mesh-outline-none focus-visible:mesh-ring-2 focus-visible:mesh-ring-foreground focus-visible:mesh-ring-offset-2 focus-visible:mesh-ring-offset-background active:mesh-scale-98"
      >
        <div>
          <span>Close</span>
        </div>
      </Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
