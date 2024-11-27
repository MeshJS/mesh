<script lang="ts">
    import { onMount } from 'svelte';
    import {BrowserWallet, type Wallet } from "@meshsdk/core"
	import { BrowserWalletState, connectWallet, disconnectWallet } from '../state/browser-wallet-state.svelte.js';
	import { type ConnectWalletButtonProps} from '.';

	const {
		label = 'Connect Wallet',
		isDark = false,
		metamask = undefined,
		extensions = []
	}: ConnectWalletButtonProps = $props();

	let availableWallets: Wallet[] = $state([])

	onMount(() => {
	 BrowserWallet.getAvailableWallets().then(aw => {
		availableWallets = aw
		});
	})

	let hideMenuList: boolean = $state(true);
</script>

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
		{:else if BrowserWalletState.browserWallet === undefined}
			{label}
		{:else if BrowserWalletState.wallet && BrowserWalletState.browserWallet && BrowserWalletState.lovelaceBalance}
			<img alt="Wallet Icon" class="mesh-m-2 mesh-h-6" src={BrowserWalletState.wallet.icon} />₳{' '}
			{parseInt((parseInt(BrowserWalletState.lovelaceBalance, 10) / 1_000_000).toString(), 10)}.
			<span class="mesh-text-xs"
				>{BrowserWalletState.lovelaceBalance.substring(
					BrowserWalletState.lovelaceBalance.length - 6
				)}</span
			>
		{:else if BrowserWalletState.wallet && BrowserWalletState.browserWallet && BrowserWalletState.lovelaceBalance === undefined}
			Getting Balance...
		{/if}
		<svg
			class="mesh-m-2 mesh-h-6"
			fill="none"
			aria-hidden="true"
			viewBox="0 0 24 24"
			stroke="currentColor"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>
	<div
		class={`mesh-mr-menu-list mesh-absolute mesh-z-50 mesh-w-60 mesh-rounded-b-md mesh-border mesh-text-center mesh-shadow-sm mesh-backdrop-blur ${hideMenuList && 'mesh-hidden'} ${isDark ? `mesh-bg-neutral-950 mesh-text-neutral-50` : `mesh-bg-neutral-50 mesh-text-neutral-950`}`}
	>
		{#if BrowserWalletState.wallet === undefined && availableWallets.length > 0}
			{#each availableWallets as enabledWallet}
				{@render menuItem(
					enabledWallet.icon,
					() => connectWallet(enabledWallet),
					enabledWallet.name
				)}
			{/each}
		{:else if BrowserWalletState.wallet === undefined && availableWallets.length === 0}
			<span>No Wallet Found</span>
		{:else if BrowserWalletState.browserWallet}
			{@render menuItem(undefined, () => disconnectWallet(), 'Disconnect')}
		{/if}
	</div>
</div>
{#snippet menuItem(icon: string | undefined, onclick: () => void, name: string)}
	<button
		class="mesh-flex mesh-h-16 mesh-cursor-pointer mesh-items-center mesh-px-4 w-full mesh-py-2 mesh-opacity-80 hover:mesh-opacity-100"
		{onclick}
	>
		{#if icon}
			<img alt={name + ' wallet icon'} class="mesh-m-1 mesh-h-8 mesh-pr-2" src={icon} />
		{/if}
		<span
			class="mesh-mr-menu-item mesh-text-xl mesh-font-normal mesh-text-gray-700 hover:mesh-text-black"
			class:mesh-text-white={isDark}
			class:hover:mesh-text-gray-700={isDark}
		>
			{name
				.split(' ')
				.map((word: string) => {
					return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
				})
				.join(' ')}
		</span>
	</button>
{/snippet}
