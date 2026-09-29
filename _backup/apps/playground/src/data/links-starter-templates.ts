/**
 * Starter templates from https://github.com/MeshJS?q=template&type=all
 * Each template can have a live demo at https://<repo-name>.meshjs.dev
 */

export type StarterTemplate = {
  name: string;
  description: string;
  githubUrl: string;
  liveUrl?: string;
};

export const starterTemplates: StarterTemplate[] = [
  {
    name: "Next.js",
    description:
      "Start a new project on Next.js with connect wallet button and wallet integration.",
    githubUrl: "https://github.com/MeshJS/mesh-nextjs-template",
    liveUrl: "https://starter-template.meshjs.dev",
  },
  {
    name: "Svelte",
    description: "Start a new project with Svelte and Mesh.",
    githubUrl: "https://github.com/MeshJS/mesh-svelte-template",
    liveUrl: "https://mesh-svelte-template.meshjs.dev",
  },
  {
    name: "Aiken",
    description: "Build with Aiken smart contracts and Mesh.",
    githubUrl: "https://github.com/MeshJS/mesh-aiken-template",
    liveUrl: "https://aiken-template.meshjs.dev",
  },
  {
    name: "Midnight",
    description: "Mesh Midnight starter template with counter contract and Vite React frontend.",
    githubUrl: "https://github.com/MeshJS/midnight-starter-template",
  },
  {
    name: "Minting",
    description: "Sell native tokens with multi-sig minting.",
    githubUrl: "https://github.com/MeshJS/minting-template",
    liveUrl: "https://minting-template.meshjs.dev",
  },
  {
    name: "Standalone",
    description: "Execute a standalone script to manage wallets and create transactions.",
    githubUrl: "https://github.com/MeshJS/standalone-template",
  },
];

export const metaStarterTemplates = {
  title: "Starter Templates",
  desc: "Scaffold a new project with Mesh using our starter templates. Each template includes wallet connection and integration to get you building quickly.",
  link: "/starter-templates",
};

export const GITHUB_TEMPLATES_URL =
  "https://github.com/MeshJS?q=template&type=all&language=&sort=";
