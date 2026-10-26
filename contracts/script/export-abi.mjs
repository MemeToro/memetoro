import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Copies each published contract's ABI from the latest `forge build` into abi/,
// where interfaces such as the website take them from. The files are written
// here rather than through shell redirection, which re-encodes output on some
// Windows shells and would leave a file the drift test cannot parse.
const PUBLISHED_CONTRACTS = ["FairLaunchEscrow", "RoundFactory"];

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const name of PUBLISHED_CONTRACTS) {
  const compiledPath = resolve(root, `out/${name}.sol/${name}.json`);
  const publishedPath = resolve(root, `abi/${name}.json`);

  let compiled;
  try {
    compiled = JSON.parse(readFileSync(compiledPath, "utf8"));
  } catch (error) {
    console.error(`Could not read ${compiledPath}. Run \`forge build\` first.`);
    throw error;
  }

  writeFileSync(publishedPath, `${JSON.stringify(compiled.abi, null, 2)}\n`);
  console.log(`Wrote ${compiled.abi.length} ABI entries to ${publishedPath}`);
}
