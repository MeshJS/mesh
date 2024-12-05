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

<div
  role="button"
  tabindex="0"
  aria-label="Connect Wallet"
  onmouseenter={() => (hideMenuList = false)}
  onmouseleave={() => (hideMenuList = true)}
  class="mesh-z-50 mesh-w-min"
>
  <button
    class={`mesh-mr-menu-list mesh-flex mesh-w-60 mesh-items-center mesh-justify-center mesh-rounded-t-md mesh-border mesh-px-4 mesh-py-2 mesh-text-lg mesh-font-normal mesh-shadow-sm ${isDark ? `mesh-bg-neutral-950 mesh-text-neutral-50` : `mesh-bg-neutral-50 mesh-text-neutral-950`}`}
    onclick={() => (hideMenuList = !hideMenuList)}
  >
    {#if BrowserWalletState.connecting}
      Connecting...
    {:else if BrowserWalletState.wallet === undefined}
      {label}
    {:else if BrowserWalletState.wallet && BrowserWalletState.wallet && lovelaceBalance}
      <img
        alt="Wallet Icon"
        class="mesh-m-2 mesh-h-6"
        src={BrowserWalletState.icon}
      />₳{" "}
      {parseInt((parseInt(lovelaceBalance, 10) / 1_000_000).toString(), 10)}.
      <span class="mesh-text-xs"
        >{lovelaceBalance.substring(lovelaceBalance.length - 6)}</span
      >
    {:else if BrowserWalletState.wallet && BrowserWalletState.wallet && lovelaceBalance === undefined}
      Loading...
    {/if}
    <svg
      class="mesh-m-2 mesh-h-6"
      fill="none"
      aria-hidden="true"
      viewBox="0 0 24 24"
      stroke="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M19 9l-7 7-7-7"
      />
    </svg>
  </button>
  <div
    class={`mesh-mr-menu-list mesh-absolute mesh-z-50 mesh-w-60 mesh-rounded-b-md mesh-border mesh-text-center mesh-shadow-sm mesh-backdrop-blur ${hideMenuList && "mesh-hidden"} ${isDark ? `mesh-bg-neutral-950 mesh-text-neutral-50` : `mesh-bg-neutral-50 mesh-text-neutral-950`}`}
  >
    {#if BrowserWalletState.wallet === undefined && availableWallets.length > 0}
      {#each availableWallets as enabledWallet}
        {@render menuItem(
          enabledWallet.icon,
          () => connect(enabledWallet),
          enabledWallet.name,
        )}
      {/each}
    {:else if BrowserWalletState.wallet === undefined && availableWallets.length === 0}
      <span>No Wallet Found</span>
    {:else if BrowserWalletState.wallet}
      {@render menuItem(undefined, () => disconnect(), "Disconnect")}
    {/if}
  </div>
</div>
{#snippet menuItem(icon: string | undefined, onclick: () => void, name: string)}
  <button
    class="mesh-flex mesh-h-16 mesh-cursor-pointer mesh-items-center mesh-px-4 mesh-w-full mesh-py-2 mesh-opacity-80 hover:mesh-opacity-100"
    {onclick}
  >
    {#if icon}
      <img
        alt={name + " wallet icon"}
        class="mesh-m-1 mesh-h-8 mesh-pr-2"
        src={icon}
      />
    {/if}
    <span
      class="mesh-mr-menu-item mesh-text-xl mesh-font-normal mesh-text-gray-700"
      class:mesh-text-white={isDark}
    >
      {name
        .split(" ")
        .map((word: string) => {
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(" ")}
    </span>
  </button>
{/snippet}
