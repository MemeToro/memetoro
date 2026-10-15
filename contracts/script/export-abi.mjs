import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Copies the escrow's ABI from the latest `forge build` into abi/, where
// interfaces such as the website take it from. The file is written here rather
// than through shell redirection, which re-encodes output on some Windows
// shells and would leave a file the drift test cannot parse.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const compiledPath = resolve(root, "out/FairLaunchEscrow.sol/FairLaunchEscrow.json");
const publishedPath = resolve(root, "abi/FairLaunchEscrow.json");

let compiled;
try {
  compiled = JSON.parse(readFileSync(compiledPath, "utf8"));
} catch (error) {
  console.error(`Could not read ${compiledPath}. Run \`forge build\` first.`);
  throw error;
}

writeFileSync(publishedPath, `${JSON.stringify(compiled.abi, null, 2)}\n`);
console.log(`Wrote ${compiled.abi.length} ABI entries to ${publishedPath}`);
