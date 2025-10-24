#!/usr/bin/env node
import fs from "fs";
import path from "path";

// Make the main script executable
const indexPath = path.join(__dirname, "index.js");
fs.chmodSync(indexPath, "755");

console.log("✅ midnight-contracts-wizard CLI is ready!");
console.log("📦 To publish to npm:");
console.log("   1. npm login");
console.log("   2. npm publish");
console.log("   3. Users can then run: npx @meshsdk/midnight-contracts-wizard");
