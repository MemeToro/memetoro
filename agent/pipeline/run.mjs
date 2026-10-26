import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateConcept } from "./lib/concept.mjs";
import { DEFAULT_IMAGE_MODEL, generateImage } from "./lib/image.mjs";
import { LAUNCH_POLICIES } from "./lib/manifest.mjs";
import { produceDocument } from "./lib/produce.mjs";
import { publicationFiles, writePublication } from "./lib/publish.mjs";
import { renderMarkdown } from "./lib/render.mjs";
import { normalizeSignals } from "./lib/signals.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIRECTORY = resolve(SCRIPT_DIRECTORY, "fixtures");
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

/** The frozen image the propose scenario's concept produced in a live run. */
async function loadFixtureImage() {
  const metadata = await readJson(resolve(FIXTURE_DIRECTORY, "image-response.json"));
  return { ...metadata, bytes: await readFile(resolve(FIXTURE_DIRECTORY, "concept-image.jpg")) };
}

await main().catch((error) => {
  console.error(`Pipeline failed: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const envPath = resolve(SCRIPT_DIRECTORY, "../..", ".env");
  if (existsSync(envPath)) {
    loadEnvFile(envPath);
  }

  const model = process.env.XAI_MODEL || DEFAULT_MODEL;
  const scenario = DRY_RUN_SCENARIOS[options.scenario];

  const sourceDocument = await readJson(
    options.dryRun
      ? resolve(FIXTURE_DIRECTORY, scenario.signals)
      : options.signalsPath === "-"
        ? "-"
        : resolve(process.cwd(), options.signalsPath),
  );
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
    generatedAt: options.dryRun ? window.generatedAt : new Date().toISOString(),
    dryRun: options.dryRun,
    generator: model,
    policy: options.policy,
    createImage: options.dryRun
      ? () => loadFixtureImage()
      : (prompt) =>
          generateImage(prompt, {
            apiKey: process.env.XAI_API_KEY,
            model: process.env.XAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
          }),
  });

  if (options.publishDir) {
    const files = publicationFiles({ document, image });
    await writePublication(resolve(process.cwd(), options.publishDir), files);
    console.log(files.map((file) => file.path).join("\n"));
    return;
  }

  const output =
    options.format === "markdown" ? renderMarkdown(document) : JSON.stringify(document, null, 2);

  // Writing the file directly rather than relying on shell redirection, which
  // re-encodes on some platforms and would corrupt non-ASCII topic text. A
  // published document whose bytes changed in transit no longer matches its
  // own commitment.
  if (options.outputPath) {
    await writeFile(resolve(process.cwd(), options.outputPath), `${output}\n`, "utf8");
    return;
  }

  console.log(output);
}

function parseArguments(argumentsList) {
  const options = {
    dryRun: false,
    help: false,
    signalsPath: "",
    scenario: "propose",
    format: "json",
    saveConceptPath: "",
    outputPath: "",
    publishDir: "",
    policy: "standard",
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--signals") {
      options.signalsPath = argumentsList[index + 1] ?? "";
      index += 1;
    } else if (argument === "--scenario") {
      options.scenario = argumentsList[index + 1] ?? "";
      index += 1;
    } else if (argument === "--format") {
      options.format = argumentsList[index + 1] ?? "";
      index += 1;
    } else if (argument === "--save-concept") {
      options.saveConceptPath = argumentsList[index + 1] ?? "";
      index += 1;
    } else if (argument === "--out") {
      options.outputPath = argumentsList[index + 1] ?? "";
      index += 1;
    } else if (argument === "--publish-dir") {
      options.publishDir = argumentsList[index + 1] ?? "";
      index += 1;
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
  if (!options.dryRun && !options.signalsPath) {
    throw new Error("Pass --dry-run or provide a trend file with --signals <path>");
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
  if (options.format !== "json" && options.format !== "markdown") {
    throw new Error("--format must be json or markdown");
  }
  if (options.saveConceptPath && options.dryRun) {
    throw new Error("--save-concept only applies to live runs");
  }
  if (!Object.hasOwn(LAUNCH_POLICIES, options.policy)) {
    throw new Error(`--policy must be one of: ${Object.keys(LAUNCH_POLICIES).join(", ")}`);
  }
  if (options.publishDir && options.outputPath) {
    throw new Error("--publish-dir cannot be combined with --out");
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node run.mjs --dry-run [--scenario propose|decline] [--format json|markdown]
  node run.mjs --signals <trend-signals.json> [--format json|markdown] [--policy standard|testnet]
  node run.mjs --signals <path> --save-concept <path>
  node run.mjs --dry-run --out <path>
  node run.mjs --dry-run --publish-dir <directory>
  <collector command> | node run.mjs --signals -`);
}

async function readJson(path) {
  let contents;
  if (path === "-") {
    contents = await readStandardInput();
  } else {
    try {
      contents = await readFile(path, "utf8");
    } catch (error) {
      throw new Error(`Could not read ${path}: ${error.message}`, { cause: error });
    }
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`File is not valid JSON: ${path}`, { cause: error });
  }
}

async function readStandardInput() {
  let contents = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    contents += chunk;
  }
  if (!contents.trim()) {
    throw new Error("Standard input did not contain trend-signal JSON");
  }
  return contents;
}
