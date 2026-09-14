#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = join(
  repo,
  "packages/mesh-core-cst/test/fixtures/scalus-v3.mjs",
);
const packages = ["mesh-common", "mesh-core-cst", "mesh-scalus-emulator"];

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += chunk));
    child.stderr?.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) return resolvePromise({ stdout, stderr });
      reject(
        new Error(
          `${command} ${args.join(" ")} failed (${signal ?? code})\n${stdout}${stderr}`,
        ),
      );
    });
  });
}

function runChrome(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    let result;
    let killTimer;
    const timeout = setTimeout(() => {
      if (result) return;
      result = new Error(
        `Chrome timed out after 45 seconds\n${stdout}\n${stderr}`,
      );
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
    }, 45_000);
    const finishFromDom = () => {
      if (result) return;
      if (stdout.includes("SCALUS_BROWSER_TEST_PASSED")) {
        result = { stdout, stderr };
        clearTimeout(timeout);
        child.kill("SIGTERM");
        killTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
      } else if (stdout.includes("SCALUS_BROWSER_TEST_FAILED")) {
        result = new Error(`browser runtime failed\n${stdout}\n${stderr}`);
        clearTimeout(timeout);
        child.kill("SIGTERM");
        killTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
      }
    };
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      finishFromDom();
    });
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      clearTimeout(killTimer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      clearTimeout(killTimer);
      if (!result && code === 0) result = { stdout, stderr };
      if (!result)
        result = new Error(
          `Chrome failed (${signal ?? code})\n${stdout}\n${stderr}`,
        );
      result instanceof Error ? reject(result) : resolvePromise(result);
    });
  });
}

async function pack(packageName, packDir) {
  const packageDir = join(repo, "packages", packageName);
  await access(join(packageDir, "dist", "index.js"), constants.R_OK);
  await access(join(packageDir, "dist", "index.cjs"), constants.R_OK);
  await access(join(packageDir, "dist", "index.d.ts"), constants.R_OK);
  const { stdout } = await run(
    "npm",
    ["pack", packageDir, "--json", "--pack-destination", packDir],
    { cwd: repo },
  );
  const result = JSON.parse(stdout);
  assert.equal(result.length, 1, `npm pack returned ${result.length} results`);
  return join(packDir, result[0].filename);
}

const nodeEsmConsumer = String.raw`
import assert from "node:assert/strict";
import { OfflineEvaluatorScalus, TransactionUnspentOutput, fromTxUnspentOutput } from "@meshsdk/core-cst";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";
import { scriptTxCborHex, scriptUtxoCborHex } from "./scalus-v3.mjs";

const utxo = fromTxUnspentOutput(
  TransactionUnspentOutput.fromCbor("82" + scriptUtxoCborHex.slice(2)),
);
const evaluator = new OfflineEvaluatorScalus(
  { fetchUTxOs: async () => [utxo] },
  "preview",
);
assert.deepEqual(await evaluator.evaluateTx(scriptTxCborHex, [utxo]), [
  { tag: "REWARD", index: 0, budget: { mem: 32318, steps: 8754898 } },
]);
const provider = await ScalusEmulator.create();
assert.ok((await provider.fetchProtocolParameters()).minFeeA > 0);
assert.equal((await provider.fetchCostModels()).length, 3);
assert.deepEqual(await provider.fetchUTxOs("00".repeat(32)), []);
console.log("ESM package exports passed");
`;

const nodeCjsConsumer = String.raw`
const assert = require("node:assert/strict");
const { OfflineEvaluatorScalus, TransactionUnspentOutput, fromTxUnspentOutput } = require("@meshsdk/core-cst");
const { ScalusEmulator } = require("@meshsdk/scalus-emulator");

(async () => {
  const { scriptTxCborHex, scriptUtxoCborHex } = await import("./scalus-v3.mjs");
  const utxo = fromTxUnspentOutput(
    TransactionUnspentOutput.fromCbor("82" + scriptUtxoCborHex.slice(2)),
  );
  const evaluator = new OfflineEvaluatorScalus(
    { fetchUTxOs: async () => [utxo] },
    "preview",
  );
  assert.deepEqual(await evaluator.evaluateTx(scriptTxCborHex, [utxo]), [
    { tag: "REWARD", index: 0, budget: { mem: 32318, steps: 8754898 } },
  ]);
  const provider = await ScalusEmulator.create();
  assert.ok((await provider.fetchProtocolParameters()).minFeeA > 0);
  assert.equal((await provider.fetchCostModels()).length, 3);
  assert.deepEqual(await provider.fetchUTxOs("00".repeat(32)), []);
  console.log("CJS package exports passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;

const browserConsumer = String.raw`
import { Buffer } from "buffer";
import { OfflineEvaluatorScalus, TransactionUnspentOutput, fromTxUnspentOutput } from "@meshsdk/core-cst";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";
import { scriptTxCborHex, scriptUtxoCborHex } from "./scalus-v3.mjs";

globalThis.Buffer = Buffer;

async function main() {
  const utxo = fromTxUnspentOutput(
    TransactionUnspentOutput.fromCbor("82" + scriptUtxoCborHex.slice(2)),
  );
  const budgets = await new OfflineEvaluatorScalus(
    { fetchUTxOs: async () => [utxo] },
    "preview",
  ).evaluateTx(scriptTxCborHex, [utxo]);
  if (JSON.stringify(budgets) !== JSON.stringify([
    { tag: "REWARD", index: 0, budget: { mem: 32318, steps: 8754898 } },
  ])) throw new Error("unexpected browser evaluator budget: " + JSON.stringify(budgets));
  const provider = await ScalusEmulator.create();
  if ((await provider.fetchProtocolParameters()).minFeeA <= 0)
    throw new Error("invalid protocol parameters");
  if ((await provider.fetchCostModels()).length !== 3)
    throw new Error("invalid cost models");
  if ((await provider.fetchUTxOs("00".repeat(32))).length !== 0)
    throw new Error("unexpected UTxOs");
  document.body.dataset.result = "passed";
  document.body.textContent = "SCALUS_BROWSER_TEST_PASSED";
}

main().catch((error) => {
  document.body.dataset.result = "failed";
  document.body.textContent = "SCALUS_BROWSER_TEST_FAILED: " + (error?.stack ?? error);
});
`;

const typeConsumer = String.raw`
import type { IFetcher } from "@meshsdk/common";
import { OfflineEvaluatorScalus } from "@meshsdk/core-cst";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";

const fetcher = { fetchUTxOs: async () => [] } as unknown as IFetcher;
const evaluator = new OfflineEvaluatorScalus(fetcher, "preview");
const evaluation: Promise<unknown> = evaluator.evaluateTx("80");

async function useProvider(): Promise<void> {
  const provider = await ScalusEmulator.create();
  await provider.fetchProtocolParameters();
  await provider.fetchCostModels();
  await provider.fetchUTxOs("00".repeat(32));
}

// @ts-expect-error initial UTxOs must be an array
void ScalusEmulator.create("invalid");
void evaluation;
void useProvider();
`;

async function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  throw new Error(
    "Chrome/Chromium was not found. Set CHROME_BIN to an executable browser path.",
  );
}

async function serve(directory, callback) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://localhost").pathname;
      const filename = pathname === "/" ? "index.html" : pathname.slice(1);
      if (!/^[a-zA-Z0-9._-]+$/.test(filename)) throw new Error("invalid path");
      const body = await readFile(join(directory, filename));
      response.writeHead(200, {
        "content-type": filename.endsWith(".js")
          ? "text/javascript"
          : "text/html; charset=utf-8",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  try {
    const { port } = server.address();
    return await callback(`http://127.0.0.1:${port}/`);
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

async function main() {
  if (Number(process.versions.node.split(".")[0]) < 20)
    throw new Error("This integration test requires Node.js 20 or newer");

  const workspace = await mkdtemp(join(tmpdir(), "mesh-scalus-packages-"));
  try {
    const packDir = join(workspace, "packs");
    await mkdir(packDir, { recursive: true });
    const tarballs = [];
    for (const packageName of packages)
      tarballs.push(await pack(packageName, packDir));

    const scalus = process.env.SCALUS_TARBALL
      ? resolve(process.env.SCALUS_TARBALL)
      : "scalus@^1.2.1";
    if (process.env.SCALUS_TARBALL) await access(scalus, constants.R_OK);
    await writeFile(
      join(workspace, "package.json"),
      JSON.stringify({ private: true, type: "module" }, null, 2) + "\n",
    );
    await run(
      "npm",
      [
        "install",
        "--no-package-lock",
        "--no-save",
        ...tarballs,
        scalus,
        "buffer@^6.0.3",
        "crypto-browserify@^3.12.1",
        "events@^3.3.0",
        "stream-browserify@^3.0.0",
      ],
      { cwd: workspace },
    );
    const installedScalus = JSON.parse(
      await readFile(
        join(workspace, "node_modules/scalus/package.json"),
        "utf8",
      ),
    );
    const [scalusMajor, scalusMinor] = installedScalus.version
      .split(".")
      .map(Number);
    assert.ok(
      scalusMajor === 1 && scalusMinor >= 2,
      `expected Scalus ^1.2.1, installed ${installedScalus.version}`,
    );

    await copyFile(fixture, join(workspace, "scalus-v3.mjs"));
    await writeFile(join(workspace, "consumer.mjs"), nodeEsmConsumer);
    await writeFile(join(workspace, "consumer.cjs"), nodeCjsConsumer);
    process.stdout.write(
      (await run(process.execPath, ["consumer.mjs"], { cwd: workspace }))
        .stdout,
    );
    process.stdout.write(
      (await run(process.execPath, ["consumer.cjs"], { cwd: workspace }))
        .stdout,
    );
    await writeFile(join(workspace, "consumer.ts"), typeConsumer);
    await writeFile(
      join(workspace, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            module: "NodeNext",
            moduleResolution: "NodeNext",
            target: "ES2022",
            strict: true,
            noEmit: true,
            skipLibCheck: true,
          },
          files: ["consumer.ts"],
        },
        null,
        2,
      ) + "\n",
    );
    const tsc = createRequire(
      join(repo, "packages/mesh-core-cst/package.json"),
    ).resolve("typescript/bin/tsc");
    await run(process.execPath, [tsc, "--project", "tsconfig.json"], {
      cwd: workspace,
    });
    console.log("TypeScript package declarations passed");

    await writeFile(join(workspace, "browser-entry.js"), browserConsumer);
    const browserGlobals = join(workspace, "browser-globals.js");
    await writeFile(
      browserGlobals,
      'import { Buffer } from "buffer"; globalThis.Buffer = Buffer; export { Buffer };\n',
    );
    await build({
      entryPoints: [join(workspace, "browser-entry.js")],
      outfile: join(workspace, "browser.js"),
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2022",
      absWorkingDir: workspace,
      inject: [browserGlobals],
      alias: {
        crypto: "crypto-browserify",
        events: "events",
        stream: "stream-browserify",
      },
      logLevel: "warning",
    });
    assert.doesNotMatch(
      await readFile(join(workspace, "browser.js"), "utf8"),
      /["']node:crypto["']/,
      "browser bundle retained a Node-only node:crypto import",
    );
    await writeFile(
      join(workspace, "index.html"),
      '<!doctype html><body data-result="running">SCALUS_BROWSER_TEST_RUNNING' +
        '<script>window.onerror=(m,s,l,c,e)=>{document.body.dataset.result="failed";document.body.textContent="SCALUS_BROWSER_TEST_FAILED: "+(e?.stack??m)};window.onunhandledrejection=e=>window.onerror(e.reason?.message??e.reason,"",0,0,e.reason)</script>' +
        '<script src="./browser.js"></script></body>',
    );
    const chrome = await findChrome();
    await serve(workspace, async (url) => {
      const { stdout, stderr } = await runChrome(
        chrome,
        [
          "--headless=new",
          "--disable-gpu",
          "--dump-dom",
          "--virtual-time-budget=30000",
          `--user-data-dir=${join(workspace, "chrome-profile")}`,
          url,
        ],
        { cwd: workspace },
      );
      assert.match(
        stdout,
        /data-result="passed"[^>]*>SCALUS_BROWSER_TEST_PASSED/,
        `browser runtime did not pass\n${stdout}\n${stderr}`,
      );
    });
    console.log("Browser package exports passed");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
