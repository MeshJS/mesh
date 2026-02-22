import { LightBulbIcon } from "@heroicons/react/24/solid";

export const metaCatalyst = {
  link: `/about/catalyst`,
  title: "Project Catalyst",
  desc: "Proposals that we have submitted to Project Catalyst and its progress.",
  icon: LightBulbIcon,
};

export const fund13 = [
  {
    title: "Hydra Tools for administrating & interacting with Hydra Heads",
    desc: "Provide all the tools needed to integration Hydra on apps, to enable end-user operations like interacting with wallet, query UTXOs/balance and submit transactions.",
    url: "https://projectcatalyst.io/funds/13/f13-cardano-open-developers/mesh-hydra-tools-for-administrating-and-interacting-with-hydra-heads",
    completed: [],
    tobecompleted: [
      `Hydra Provider`,
      `Wallets integration`,
      `Transaction building`,
      `End-to-end working example`,
    ],
    status: "In Progress",
  },
  {
    title: "Cardano Devkit - 'Ganache' of Cardano for better DevXP",
    desc: "An app to launch local blockchain to test and deploy transactions and smart contracts, to run tests and experiments to develop Cardano applications.",
    url: "https://projectcatalyst.io/funds/13/f13-cardano-use-cases-concept/mesh-cardano-devkit-ganache-better-devxp-with-local-cardano-network",
    completed: [],
    tobecompleted: [
      `Improve devnet deployment`,
      `Desktop app to launch local blockchain`,
      `Get blockchain data e.g. UTXOs and balances`,
    ],
    status: "In Progress",
    funded: false,
  },
  {
    title: "Cquisitor - Transaction Investigation Tool",
    desc: "Enhancing Devtools with hosted Rust-based validation modules, and improving error handling to provide clearer feedback, helping developers debug and validate efficiently.",
    url: "https://projectcatalyst.io/funds/13/f13-cardano-open-developers/mesh-cquisitor-transaction-investigation-tool",
    completed: [],
    tobecompleted: [
      `Update Cquisitor`,
      `Phase-1 validation`,
      `Phase-2 validation`,
      `Integration with Whisky and Mesh`,
    ],
    status: "In Progress",
  },
  {
    title: "Multisig Platform",
    desc: "Open source multisig platform for teams and organizations to manage their treasury and participate in governance.",
    url: "https://projectcatalyst.io/funds/13/f13-cardano-use-cases-product/cardano-multisig-platform-by-mesh-clarity-dao-and-fluid-tokens",
    completed: [],
    tobecompleted: [
      `Full governance features`,
      `Native tokens support`,
      `Discord integrations`,
      `Fluidtokens and Minswap integrations`,
      `Plutus script multisig wallet`,
    ],
    status: "In Progress",
  },
  {
    title: "Builder Fest #2 in Asia",
    desc: "Hosting Buidler Fest #2, a 2-day event for tech-savvy Cardano builders to connect, showcase and share.",
    url: "https://projectcatalyst.io/funds/13/f13-cardano-open-ecosystem/cardano-builder-fest-asia-by-mesh-socious-sidan-vietnam-cardano",
    completed: [],
    tobecompleted: [
      `Gathering of developers in Vietnam`,
      `Increase collaboration between projects for Cardano ecosystem open-source`,
    ],
    status: "In Progress",
  },
  {
    title: "Maintain Mesh and Build Developer Community",
    desc: "Maintenance and operations of the Mesh open source libraries and tool suits. Growing Cardano developer community.",
    url: "https://projectcatalyst.io/funds/13/f13-cardano-open-developers/maintain-mesh-and-build-developer-community",
    completed: [],
    tobecompleted: [
      `Provide community support`,
      `Resolve GitHub issues`,
      `Create tutorials and documentation`,
      `Create workshops and live coding sessions`,
    ],
    status: "In Progress",
  },
];

export const fund12 = [
  {
    title: "Cardano Service Layer Framework for DApps",
    desc: "R&D a framework to quickly spin up a service layer for specific Cardano DApps, allowing DApps to re-use all infrastructure such as contracts and MeshJS, while possible for custom protocol parameters.",
    url: "https://projectcatalyst.io/funds/12/cardano-open-developers/sidan-or-meshjs-cardano-service-layer-framework-for-dapps",
    completed: [
      `Parallel Cardano Blockchain MeshJS Integration`,
      `Customized Protocol Parameters`,
    ],
    tobecompleted: [
      `Persistent Record & Immutability`,
      `Framework DevOps`,
      `Documentation and training materials`,
    ],
    status: "In Progress",
  },
  {
    title: "New Features to Improve Developer experience and Adoption",
    desc: "We will upgrade Mesh by implementing CIP 45, WebRTC wallet connect, handle multiple serialization libs, revamp to support backend transactions building, and improve error messages to improve DevXP.",
    url: "https://projectcatalyst.io/funds/12/cardano-open-developers/mesh-new-features-to-improve-developer-experience-and-cardano-adoption",
    completed: [
      "Mesh application wallet",
      "Modular CSL library",
      "Wallet support for private blockchain networks (e.g. Yaci)",
      "CIP 45",
      "Improve error messages",
    ],
    tobecompleted: [],
    status: "Closing",
  },
  {
    title: "Mesh Software as a Service",
    desc: "We provide hosted server instances for wallet and transactions builder by restful APIs, this allow integration and interaction to Cardano blockchain from any technology stacks and systems.",
    url: "https://projectcatalyst.io/funds/12/cardano-use-cases-concept/mesh-software-as-a-service",
    completed: [
      "Cloud infrastructure",
      "User-defined transaction building",
      "JSON schema for transaction",
      "Utitlities for transaction building",
    ],
    tobecompleted: ["Hosted wallet / private key for signing"],
    status: "In Progress",
  },
  {
    title:
      "Maintaining Mesh SDK, community support and content creation to onboard developers",
    desc: "Maintenance and operations of Mesh SDK, community support and content creation, in order to onboard developers and users to the Cardano blockchain ecosystem.",
    url: "https://projectcatalyst.io/funds/12/cardano-open-developers/sustain-and-maintain-mesh-sdk",
    completed: [
      `Provide community support`,
      `Resolve GitHub issues`,
      `Create tutorials and documentation`,
      `Create workshops and live coding sessions`,
    ],
    tobecompleted: [],
    status: "Closing",
  },
];

export const fund11 = [
  {
    title: "Aiken Open-Source Smart Contract Library",
    desc: "We create a collection of open-source smart contracts with Aiken (including Workspace, Mesh TX builder components) and integrate them into the Mesh SDK library on Github - open and accessible to all. ",
    url: "https://projectcatalyst.io/funds/11/cardano-open-developers/aiken-open-source-smart-contract-library-by-meshjs-and-trustlevel",
    completed: [
      "Marketplace",
      "Escrow",
      "Vesting",
      "Gift card",
      "Swap",
      "Payment splitter",
      "Content ownership",
      "NFT minting machine",
    ],
    tobecompleted: ["Bad examples"],
    status: "In Progress",
  },
  {
    title: "Sustain & Maintain MeshJS",
    desc: "This proposal enables implementations not limited to Voltaire features, Hydra & Aiken integration, and data providers integrations. Including bounties for issues, features, and learning materials.",
    url: "https://projectcatalyst.io/funds/11/cardano-open-developers/sustain-and-maintain-meshjs",
    completed: [
      "Lower-level APIs completed",
      "Technical documentation released",
      "Resolved numerous reported GitHub issues",
      "Active Discord engagement to help developers",
      "Transaction building support for Hydra apps",
      "Plutus version 3 integration",
      "Revamped/refactored transaction and utilities class",
      "Conway features",
    ],
    tobecompleted: [],
    status: "Closing",
  },
];

export const fund10 = [
  {
    title:
      "Supporting Open-Source Library Development, Developer Resources & Builder Community",
    desc: "To guarantee and ensure sustainability of a team dedicated to maintaining and developing one of the best open-source libraries on Cardano, providing devs with something easy-to-use, fun and productive.",
    url: "https://projectcatalyst.io/funds/10/f10-osde-open-source-dev-ecosystem/meshjs-sdk-operations-supporting-open-source-library-development-developer-resources-and-builder-community",
    completed: [
      "Lower-level APIs core functionality",
      "Mesh PBL course content",
      "Workshops and live coding",
      "Community Q&A support",
      "Demos and tutorials repository",
      "Mesh PBL Season #1",
    ],
    tobecompleted: [],
    status: "Closing",
  },
  {
    title: "Support Teams Building Cardano dApps",
    desc: "Pro-actively facilitate integration of our open source code into other Cardano Projects by directly providing financial and human resources to support and facilitate these integrations.",
    url: "https://projectcatalyst.io/funds/10/f10-developer-ecosystem-the-evolution/mesh-support-teams-building-cardano-dapps-with-mesh-js-sdk-a-comprehensive-open-source-sdk-for-building-dapps-on-cardano",
    completed: ["Provide community technical support"],
    tobecompleted: ["Provide funding for integrating Cardano"],
    status: "Completed",
    funded: false,
  },
];
