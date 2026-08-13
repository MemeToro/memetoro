import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateConcept, validateConcept } from "./lib/concept.mjs";
import {
  buildLaunchManifest,
  buildNoProposalRecord,
  validateLaunchManifest,
  validateNoProposalRecord,
} from "./lib/manifest.mjs";
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

  const concept = validateConcept(rawConcept, window.signals);
  const generatedAt = options.dryRun ? window.generatedAt : new Date().toISOString();
  const context = { concept, window, generatedAt, dryRun: options.dryRun, generator: model };

  const document =
    concept.decision === "decline"
      ? validateNoProposalRecord(buildNoProposalRecord(context), window.signals)
      : validateLaunchManifest(buildLaunchManifest(context), window.signals);

  console.log(
    options.format === "markdown" ? renderMarkdown(document) : JSON.stringify(document, null, 2),
  );
}

function parseArguments(argumentsList) {
  const options = {
    dryRun: false,
    help: false,
    signalsPath: "",
    scenario: "propose",
    format: "json",
    saveConceptPath: "",
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

  return options;
}

function printHelp() {
  console.log(`Usage:
  node run.mjs --dry-run [--scenario propose|decline] [--format json|markdown]
  node run.mjs --signals <trend-signals.json> [--format json|markdown]
  node run.mjs --signals <path> --save-concept <path>
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
