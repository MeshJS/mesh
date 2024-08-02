import { LightBulbIcon } from "@heroicons/react/24/solid";

export const metaCatalyst = {
  link: `/about/catalyst`,
  title: "Project Catalyst",
  desc: "Here are proposals that we have submitted to Project Catalyst and its progress.",
  icon: LightBulbIcon,
};

export const fund12 = [
  {
    title: "Cardano Service Layer Framework for DApps",
    desc: "R&D a framework to quickly spin up a service layer for specific Cardano DApps, allowing DApps to re-use all infrastructure such as contracts and MeshJS, while possible for custom protocol parameters.",
    url: "https://cardano.ideascale.com/c/idea/121847",
    completed: [],
    tobecompleted: [
      `Parallel Cardano Blockchain MeshJS Integration`,
      `Customized Protocol Parameters`,
      `Persistent Record & Immutability`,
      `Framework DevOps`,
      `Documentation and training materials`,
    ],
    status: "In Progress",
  },
  {
    title:
      "Mesh New Features to Improve Developer experience and Cardano Adoption",
    desc: "We will upgrade Mesh by implementing CIP 45, WebRTC wallet connect, handle multiple serialization libs, revamp to support backend transactions building, and improve error messages to improve DevXP.",
    url: "https://cardano.ideascale.com/c/idea/122160",
    completed: [],
    tobecompleted: [
      "CIP 45",
      "Mesh application wallet",
      "Modular CSL library",
      "Improve error messages",
      "Wallet support for private blockchain networks (e.g. Yaci)",
    ],
    status: "In Progress",
  },
  {
    title: "Mesh Software as a Service",
    desc: "We provide hosted server instances for wallet and transactions builder by restful APIs, this allow integration and interaction to Cardano blockchain from any technology stacks and systems.",
    url: "https://cardano.ideascale.com/c/idea/122098",
    completed: [],
    tobecompleted: [
      "Cloud infrastructure and transaction endpoints",
      "Upgrade Mesh SDK to support SaaS",
      "Hosted wallet / private key for signing",
      "User-defined transaction building",
      "JSON schema for transaction",
    ],
    status: "In Progress",
  },
  {
    title:
      "Maintaining Mesh SDK, community support and content creation to onboard developers",
    desc: "Maintenance and operations of Mesh SDK, community support and content creation, in order to onboard developers and users to the Cardano blockchain ecosystem.",
    url: "https://cardano.ideascale.com/c/idea/122471",
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

export const fund11 = [
  {
    title: "Aiken Open-Source Smart Contract Library",
    desc: "We create a collection of open-source smart contracts with Aiken (including Workspace, Mesh TX builder components) and integrate them into the Mesh SDK library on Github - open and accessible to all. ",
    url: "https://projectcatalyst.io/funds/11/cardano-open-developers/aiken-open-source-smart-contract-library-by-meshjs-and-trustlevel",
    completed: [
      "Marketplace contract",
      "Escrow contract",
      "Vesting contract",
      "Gift card contract",
      "Coupon bond guaranteed contract",
    ],
    tobecompleted: [
      "Content ownership contract",
      "Advanced contract #2",
      "Advanced contract #3",
      "Bad examples",
    ],
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
    ],
    tobecompleted: [
      "Plutus version 3 integration",
      "Revamped/refactored transaction and utilities class",
      "Conway features",
    ],
    status: "In Progress",
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
    ],
    tobecompleted: ["Mesh PBL Season #1", "Student projects"],
    status: "In Progress",
  },
];
