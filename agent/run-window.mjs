import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { loadEnvFile } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateConcept } from "./pipeline/lib/concept.mjs";
import { DEFAULT_IMAGE_MODEL, generateImage } from "./pipeline/lib/image.mjs";
import { LAUNCH_POLICIES } from "./pipeline/lib/manifest.mjs";
import { produceDocument } from "./pipeline/lib/produce.mjs";
import { publicationFiles, writePublication } from "./pipeline/lib/publish.mjs";
import { normalizeSignals } from "./pipeline/lib/signals.mjs";

const AGENT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(AGENT_DIRECTORY, "..");
const FIXTURE_DIRECTORY = resolve(AGENT_DIRECTORY, "pipeline/fixtures");
const COLLECTOR_PATH = resolve(AGENT_DIRECTORY, "data-sources/news-x-trends/search.mjs");
const DEFAULT_MODEL = "grok-4.5";

const DRY_RUN_SCENARIOS = {
  propose: {
    signals: "trend-signals.json",
    concept: "concept-response.json",
  },
  decline: {
    signals: "sensitive-only-signals.json",
    concept: "decline-response.json",
  },
};

await main().catch((error) => {
  console.error(`Window failed: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const envPath = resolve(REPOSITORY_ROOT, ".env");
  if (existsSync(envPath)) {
    loadEnvFile(envPath);
  }

  const model = process.env.XAI_MODEL || DEFAULT_MODEL;
  const scenario = DRY_RUN_SCENARIOS[options.scenario];

  const sourceDocument = options.dryRun
    ? await readJson(resolve(FIXTURE_DIRECTORY, scenario.signals))
    : options.signalsPath
      ? await readJson(resolve(process.cwd(), options.signalsPath))
      : JSON.parse(await collectSignals());

  const window = normalizeSignals(sourceDocument);
  const rawConcept = options.dryRun
    ? await readJson(resolve(FIXTURE_DIRECTORY, scenario.concept))
    : await generateConcept(window.signals, {
        model,
        apiKey: process.env.XAI_API_KEY,
      });

  if (options.saveConceptPath) {
    await writeFile(
      resolve(process.cwd(), options.saveConceptPath),
      `${JSON.stringify(rawConcept, null, 2)}\n`,
      "utf8",
    );
  }

  const { document, image } = await produceDocument({
    window,
    rawConcept,
    generatedAt:
      options.dryRun && !options.freshClock ? window.generatedAt : new Date().toISOString(),
    dryRun: options.dryRun,
    generator: model,
    policy: options.policy,
    createImage: options.dryRun
      ? loadFixtureImage
      : (prompt) =>
          generateImage(prompt, {
            apiKey: process.env.XAI_API_KEY,
            model: process.env.XAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
          }),
  });

  const files = publicationFiles({ document, image });
  const publishDir = resolve(process.cwd(), options.publishDir);
  await writePublication(publishDir, files);

  const documentFile = files[0];
  const imageFile = files[1] ?? null;
  const publicUri = options.publicBaseUrl
    ? `${options.publicBaseUrl.replace(/\/$/, "")}/${documentFile.path}`
    : null;

  const summary = {
    kind: document.kind,
    status: document.status,
    hash: document.commitment.hash,
    documentPath: documentFile.path,
    imagePath: imageFile?.path ?? null,
    publicUri,
    policy: options.policy,
    dryRun: options.dryRun,
  };

  await writeFile(resolve(publishDir, "latest.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(summary, null, 2));
}

async function loadFixtureImage() {
  const metadata = await readJson(resolve(FIXTURE_DIRECTORY, "image-response.json"));
  return { ...metadata, bytes: await readFile(resolve(FIXTURE_DIRECTORY, "concept-image.jpg")) };
}

function collectSignals() {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [COLLECTOR_PATH], {
      cwd: REPOSITORY_ROOT,
      stdio: ["ignore", "pipe", "inherit"],
    });

    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Trend collector exited with status ${code}`));
        return;
      }
      if (!stdout.trim()) {
        reject(new Error("Trend collector wrote no JSON"));
        return;
      }
      resolvePromise(stdout);
    });
  });
}

function parseArguments(argumentsList) {
  const options = {
    dryRun: false,
    help: false,
    signalsPath: "",
    scenario: "propose",
    saveConceptPath: "",
    publishDir: "published",
    publicBaseUrl: "",
    policy: "testnet",
    freshClock: false,
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--live") {
      options.dryRun = false;
    } else if (argument === "--signals") {
      options.signalsPath = argumentsList[index + 1] ?? "";
      index += 1;
    } else if (argument === "--scenario") {
      options.scenario = argumentsList[index + 1] ?? "";
      index += 1;
    } else if (argument === "--save-concept") {
      options.saveConceptPath = argumentsList[index + 1] ?? "";
      index += 1;
    } else if (argument === "--publish-dir") {
      options.publishDir = argumentsList[index + 1] ?? "";
      index += 1;
    } else if (argument === "--public-base-url") {
      options.publicBaseUrl = argumentsList[index + 1] ?? "";
      index += 1;
    } else if (argument === "--fresh-clock") {
      options.freshClock = true;
    } else if (argument === "--policy") {
      options.policy = argumentsList[index + 1] ?? "";
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (options.help) {
    return options;
  }
  if (options.dryRun && options.signalsPath) {
    throw new Error("--dry-run cannot be combined with --signals");
  }
  if (!Object.hasOwn(DRY_RUN_SCENARIOS, options.scenario)) {
    throw new Error("--scenario must be propose or decline");
  }
  if (!options.dryRun && options.scenario !== "propose") {
    throw new Error("--scenario only applies to --dry-run");
  }
  if (options.saveConceptPath && options.dryRun) {
    throw new Error("--save-concept only applies to live runs");
  }
  if (!Object.hasOwn(LAUNCH_POLICIES, options.policy)) {
    throw new Error(`--policy must be one of: ${Object.keys(LAUNCH_POLICIES).join(", ")}`);
  }
  if (!options.publishDir) {
    throw new Error("--publish-dir needs a directory");
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node agent/run-window.mjs --dry-run [--scenario propose|decline] [--policy testnet|standard] [--fresh-clock]
  node agent/run-window.mjs --live --policy testnet --public-base-url <url>
  node agent/run-window.mjs --signals <trend-signals.json> --policy testnet

Writes the committed document and image under --publish-dir (default: published/)
and prints a JSON summary. The on-chain step is contracts/script/PublishWindow.s.sol.`);
}

async function readJson(path) {
  let contents;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Could not read ${path}: ${error.message}`, { cause: error });
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`File is not valid JSON: ${path}`, { cause: error });
  }
}
