import { commit, verifyCommitment } from "./canonical.mjs";
import { IMAGE_FORMATS, MAX_IMAGE_BYTES } from "./image.mjs";
import { summarizeEvidence } from "./signals.mjs";
import {
  addHours,
  floorToSecond,
  isIsoTimestamp,
  requiredString,
  toBaseUnits,
  toUnixSeconds,
} from "./util.mjs";

export const SCHEMA_VERSION = "0.4.0";
export const LAUNCH_MANIFEST_KIND = "memetoro.launch-manifest";
export const NO_PROPOSAL_KIND = "memetoro.no-proposal";

/**
 * Where published files sit relative to the publication root. A manifest
 * refers to its image by a URI relative to its own location, so any host that
 * keeps this layout serves a working proposal without rewriting it.
 */
export const PUBLICATION_LAYOUT = Object.freeze({
  manifests: "manifests",
  noProposals: "no-proposals",
  images: "images",
});

const SHARED_POLICY = Object.freeze({
  totalSupply: "1000000000",
  tokenDecimals: 18,
  contributorAllocationPercent: 50,
  liquidityAllocationPercent: 50,
  insiderAllocationPercent: 0,
  fundingAsset: "BNB",
  fundingAssetDecimals: 18,
  startDelayHours: 1,
  fundingDurationHours: 24,
  exitWindowHours: 12,
  finalizeGracePeriodHours: 168,
});

export const LAUNCH_POLICIES = Object.freeze({
  standard: Object.freeze({
    ...SHARED_POLICY,
    walletCap: "1",
    minimumThreshold: "10",
    maximumThreshold: "50",
  }),
  // Sized for faucet-funded wallets, so a testnet round can actually reach its
  // minimum. Everything except the amounts matches the standard policy.
  testnet: Object.freeze({
    ...SHARED_POLICY,
    walletCap: "0.01",
    minimumThreshold: "0.02",
    maximumThreshold: "0.05",
  }),
});

export function launchPolicy(name) {
  if (!Object.hasOwn(LAUNCH_POLICIES, name)) {
    throw new Error(`Unknown launch policy: ${name}`);
  }
  return LAUNCH_POLICIES[name];
}

const LAUNCH_CONDITIONS = Object.freeze([
  "Funding starts and ends at the published times.",
  "Contributions can be withdrawn until the published exit deadline.",
  "No launch happens before the exit deadline.",
  "The minimum funding threshold is met.",
  "The maximum funding threshold is not exceeded.",
]);

export function buildLaunchManifest({
  concept,
  window,
  generatedAt,
  dryRun,
  generator,
  visual,
  policy = "standard",
}) {
  const terms = launchPolicy(policy);
  // Second precision throughout, so the published ISO timestamp and the
  // integer a contract stores describe the same instant exactly.
  const startTime = floorToSecond(addHours(generatedAt, terms.startDelayHours));
  const endTime = addHours(startTime, terms.fundingDurationHours);
  const exitDeadline = addHours(startTime, terms.exitWindowHours);
  const citedEvidence = collectCitedEvidence(concept, window.signals);

  return commit({
    schemaVersion: SCHEMA_VERSION,
    kind: LAUNCH_MANIFEST_KIND,
    status: manifestStatus({ dryRun, policy }),
    concept: {
      name: concept.name,
      symbol: concept.symbol,
      summary: concept.summary,
      marketReasoning: concept.reasoning,
      riskAssessment: concept.riskAssessment,
    },
    visual: buildVisual(visual),
    evidence: citedEvidence,
    sourceFacts: summarizeEvidence(citedEvidence),
    token: {
      totalSupply: terms.totalSupply,
      contributorAllocationPercent: terms.contributorAllocationPercent,
      liquidityAllocationPercent: terms.liquidityAllocationPercent,
      insiderAllocationPercent: terms.insiderAllocationPercent,
    },
    funding: {
      asset: terms.fundingAsset,
      walletCap: terms.walletCap,
      minimumThreshold: terms.minimumThreshold,
      maximumThreshold: terms.maximumThreshold,
      startTime,
      endTime,
      exitDeadline,
    },
    chainTerms: buildChainTerms(terms, { startTime, endTime, exitDeadline }),
    execution: {
      launchConditions: [...LAUNCH_CONDITIONS],
      permissionlessFinalize: true,
      permissionlessRefund: true,
      backendRequired: false,
    },
    selection: buildSelectionRecord(window.signals, concept.selectedSignalIds),
    provenance: buildProvenance({ window, generatedAt, generator, dryRun }),
  });
}

export function buildNoProposalRecord({ concept, window, generatedAt, dryRun, generator }) {
  return commit({
    schemaVersion: SCHEMA_VERSION,
    kind: NO_PROPOSAL_KIND,
    status: dryRun ? "dry-run-declined" : "declined",
    declineReason: concept.declineReason,
    selection: buildSelectionRecord(window.signals, []),
    provenance: buildProvenance({ window, generatedAt, generator, dryRun }),
  });
}

/**
 * The same launch terms in the units a contract constructor takes.
 *
 * The human-readable `funding` and `token` blocks stay, because "1 BNB" is
 * what a reader understands, while `1000000000000000000` is what gets
 * enforced. Publishing both and checking they agree means a contributor can
 * verify the deployed round against the proposal without converting anything
 * by hand, and a drift between the two representations fails validation rather
 * than reaching a reader.
 *
 * The executor address and chain are deliberately absent. They are deployment
 * details that do not exist when the manifest is written, and publishing a
 * value nobody can check yet would be worse than publishing nothing.
 */
function buildChainTerms(terms, { startTime, endTime, exitDeadline }) {
  const { fundingAssetDecimals, tokenDecimals } = terms;

  return {
    walletCapWei: toBaseUnits(terms.walletCap, fundingAssetDecimals),
    minimumThresholdWei: toBaseUnits(terms.minimumThreshold, fundingAssetDecimals),
    maximumThresholdWei: toBaseUnits(terms.maximumThreshold, fundingAssetDecimals),
    startTime: toUnixSeconds(startTime),
    endTime: toUnixSeconds(endTime),
    exitDeadline: toUnixSeconds(exitDeadline),
    finalizeGracePeriodSeconds: terms.finalizeGracePeriodHours * 3600,
    tokenDecimals,
    tokenTotalSupplyBaseUnits: toBaseUnits(terms.totalSupply, tokenDecimals),
    contributorAllocationBps: terms.contributorAllocationPercent * 100,
    liquidityAllocationBps: terms.liquidityAllocationPercent * 100,
  };
}

/**
 * `testnet` marks a proposal whose round runs on a test network with
 * faucet-sized amounts, so nobody mistakes it for a real launch.
 */
function manifestStatus({ dryRun, policy }) {
  if (dryRun) {
    return "dry-run";
  }
  return policy === "testnet" ? "testnet" : "draft";
}

/**
 * Commits to the image and to the exact prompt that produced it. The prompt is
 * published so anyone can see what the picture was asked to show, and the
 * hash means the image cannot be swapped after funding opens.
 */
function buildVisual(visual) {
  if (!visual?.image) {
    throw new Error("A launch manifest needs a generated image");
  }

  return {
    prompt: visual.prompt,
    revisedPrompt: visual.revisedPrompt ?? null,
    generator: visual.generator,
    image: {
      uri: `../${PUBLICATION_LAYOUT.images}/${visual.image.fileName}`,
      sha256: visual.image.sha256,
      mediaType: visual.image.mediaType,
      byteLength: visual.image.byteLength,
    },
  };
}

function buildProvenance({ window, generatedAt, generator, dryRun }) {
  return {
    generatedAt,
    signalsGeneratedAt: window.generatedAt,
    windowHours: window.windowHours,
    generator: dryRun ? "fixture" : generator,
  };
}

/**
 * Publishes every candidate the agent had available, so a reader can see the
 * shortlist rather than only the winner. Risk notes travel with each rejected
 * candidate because they are the clearest signal of why it was unsuitable.
 */
function buildSelectionRecord(signals, selectedSignalIds) {
  return {
    consideredCount: signals.length,
    selectedSignalIds: [...selectedSignalIds],
    candidates: signals.map((signal) => ({
      id: signal.id,
      sourceType: signal.sourceType,
      topic: signal.topic,
      riskNotes: signal.riskNotes,
      sourceFacts: signal.sourceFacts,
      selected: selectedSignalIds.includes(signal.id),
    })),
  };
}

function collectCitedEvidence(concept, signals) {
  const cited = new Set(concept.evidenceSources);
  const selected = signals.filter((signal) => concept.selectedSignalIds.includes(signal.id));
  const seen = new Set();
  const evidence = [];

  for (const entry of selected.flatMap((signal) => signal.evidence)) {
    if (!cited.has(entry.url) || seen.has(entry.url)) {
      continue;
    }
    seen.add(entry.url);
    evidence.push({ ...entry });
  }

  return evidence;
}

export function validateLaunchManifest(manifest, signals) {
  if (manifest?.kind !== LAUNCH_MANIFEST_KIND) {
    throw new Error(`Manifest kind must be ${LAUNCH_MANIFEST_KIND}`);
  }

  requiredString(manifest.concept?.name, "manifest.concept.name");
  requiredString(manifest.concept?.summary, "manifest.concept.summary");
  requiredString(manifest.concept?.marketReasoning, "manifest.concept.marketReasoning");
  requiredString(manifest.concept?.riskAssessment, "manifest.concept.riskAssessment");
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(manifest.concept?.symbol ?? "")) {
    throw new Error("manifest.concept.symbol must contain 2-10 uppercase letters or digits");
  }

  validateSelectionRecord(manifest.selection, signals);
  validateEvidence(manifest, signals);
  validateVisual(manifest.visual);

  const token = manifest.token ?? {};
  const allocationTotal =
    token.contributorAllocationPercent +
    token.liquidityAllocationPercent +
    token.insiderAllocationPercent;
  if (allocationTotal !== 100 || token.insiderAllocationPercent !== 0) {
    throw new Error("Token allocations must total 100% with 0% insider allocation");
  }

  const funding = manifest.funding ?? {};
  if (
    Number(funding.minimumThreshold) <= 0 ||
    Number(funding.maximumThreshold) < Number(funding.minimumThreshold)
  ) {
    throw new Error("Funding thresholds are invalid");
  }
  if (
    !isIsoTimestamp(funding.startTime) ||
    !isIsoTimestamp(funding.endTime) ||
    Date.parse(funding.startTime) >= Date.parse(funding.endTime)
  ) {
    throw new Error("Funding timestamps are invalid");
  }
  if (
    !isIsoTimestamp(funding.exitDeadline) ||
    Date.parse(funding.exitDeadline) <= Date.parse(funding.startTime) ||
    Date.parse(funding.exitDeadline) > Date.parse(funding.endTime)
  ) {
    throw new Error("The exit deadline must fall inside the funding window");
  }

  validateChainTerms(manifest);

  const execution = manifest.execution ?? {};
  if (
    execution.permissionlessFinalize !== true ||
    execution.permissionlessRefund !== true ||
    execution.backendRequired !== false
  ) {
    throw new Error("Manifest execution settings violate permissionless launch policy");
  }

  // Last, so an edited document reports the specific term that is wrong rather
  // than only that something changed.
  if (!verifyCommitment(manifest)) {
    throw new Error("manifest.commitment does not match the document it commits to");
  }

  return manifest;
}

/**
 * Checks that the enforceable numbers say the same thing as the readable ones.
 * Without this the manifest could show a one BNB cap while committing a round
 * that enforces a hundred, and both halves would look internally consistent.
 */
function validateChainTerms(manifest) {
  const { funding = {}, token = {}, chainTerms } = manifest;
  if (!chainTerms || typeof chainTerms !== "object") {
    throw new Error("manifest.chainTerms must publish the enforceable launch terms");
  }

  const { fundingAssetDecimals, tokenDecimals } = SHARED_POLICY;
  const expected = {
    walletCapWei: toBaseUnits(funding.walletCap, fundingAssetDecimals),
    minimumThresholdWei: toBaseUnits(funding.minimumThreshold, fundingAssetDecimals),
    maximumThresholdWei: toBaseUnits(funding.maximumThreshold, fundingAssetDecimals),
    startTime: toUnixSeconds(funding.startTime),
    endTime: toUnixSeconds(funding.endTime),
    exitDeadline: toUnixSeconds(funding.exitDeadline),
    tokenDecimals,
    tokenTotalSupplyBaseUnits: toBaseUnits(token.totalSupply, tokenDecimals),
    contributorAllocationBps: token.contributorAllocationPercent * 100,
    liquidityAllocationBps: token.liquidityAllocationPercent * 100,
  };

  for (const [field, value] of Object.entries(expected)) {
    if (chainTerms[field] !== value) {
      throw new Error(
        `manifest.chainTerms.${field} disagrees with the published terms: ${chainTerms[field]} vs ${value}`,
      );
    }
  }

  if (
    !Number.isSafeInteger(chainTerms.finalizeGracePeriodSeconds) ||
    chainTerms.finalizeGracePeriodSeconds <= 0
  ) {
    throw new Error("manifest.chainTerms.finalizeGracePeriodSeconds must be a positive integer");
  }
  if (chainTerms.contributorAllocationBps + chainTerms.liquidityAllocationBps !== 10_000) {
    throw new Error("manifest.chainTerms allocations must assign the entire supply");
  }
}

export function validateNoProposalRecord(record, signals) {
  if (record?.kind !== NO_PROPOSAL_KIND) {
    throw new Error(`Record kind must be ${NO_PROPOSAL_KIND}`);
  }
  requiredString(record.declineReason, "record.declineReason");
  if (record.token || record.funding || record.execution || record.chainTerms) {
    throw new Error("A no-proposal record must not carry launch terms");
  }
  validateSelectionRecord(record.selection, signals, { requireSelection: false });

  if (!verifyCommitment(record)) {
    throw new Error("record.commitment does not match the document it commits to");
  }

  return record;
}

function validateSelectionRecord(selection, signals, { requireSelection = true } = {}) {
  const candidates = selection?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("selection.candidates must list the considered signals");
  }
  if (selection.consideredCount !== candidates.length) {
    throw new Error("selection.consideredCount must match the published candidate list");
  }
  if (candidates.length !== signals.length) {
    throw new Error("selection.candidates must publish every collected signal");
  }

  const selectedIds = selection.selectedSignalIds;
  if (!Array.isArray(selectedIds)) {
    throw new Error("selection.selectedSignalIds must be an array");
  }
  if (requireSelection && selectedIds.length === 0) {
    throw new Error("selection.selectedSignalIds must contain at least one signal");
  }

  const knownIds = new Set(signals.map((signal) => signal.id));
  for (const id of selectedIds) {
    if (!knownIds.has(id)) {
      throw new Error(`selection.selectedSignalIds contains an unknown signal ID: ${id}`);
    }
  }

  for (const candidate of candidates) {
    const isSelected = selectedIds.includes(candidate.id);
    if (candidate.selected !== isSelected) {
      throw new Error(`selection.candidates disagrees with selectedSignalIds for ${candidate.id}`);
    }
  }
}

function validateVisual(visual) {
  if (!visual || typeof visual !== "object") {
    throw new Error("manifest.visual must describe the proposal's image");
  }
  requiredString(visual.prompt, "manifest.visual.prompt");
  requiredString(visual.generator, "manifest.visual.generator");
  if (visual.revisedPrompt !== null && typeof visual.revisedPrompt !== "string") {
    throw new Error("manifest.visual.revisedPrompt must be a string or null");
  }

  const image = visual.image ?? {};
  const format = IMAGE_FORMATS[image.mediaType];
  if (!format) {
    throw new Error(`manifest.visual.image.mediaType is not supported: ${image.mediaType}`);
  }
  if (!/^0x[0-9a-f]{64}$/.test(image.sha256 ?? "")) {
    throw new Error("manifest.visual.image.sha256 must be a 32-byte hex digest");
  }
  // The location is derived from the content, so the URI cannot point at a
  // different file from the one the digest describes.
  const expectedUri = `../${PUBLICATION_LAYOUT.images}/${image.sha256.slice(2)}.${format.extension}`;
  if (image.uri !== expectedUri) {
    throw new Error(`manifest.visual.image.uri must be ${expectedUri}`);
  }
  if (
    !Number.isSafeInteger(image.byteLength) ||
    image.byteLength <= 0 ||
    image.byteLength > MAX_IMAGE_BYTES
  ) {
    throw new Error("manifest.visual.image.byteLength is out of range");
  }
}

function validateEvidence(manifest, signals) {
  const evidence = manifest.evidence;
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new Error("manifest.evidence must contain at least one entry");
  }

  const selectedIds = manifest.selection.selectedSignalIds;
  const allowedUrls = new Set(
    signals
      .filter((signal) => selectedIds.includes(signal.id))
      .flatMap((signal) => signal.evidence.map((entry) => entry.url)),
  );

  for (const entry of evidence) {
    if (!allowedUrls.has(entry?.url)) {
      throw new Error(`manifest.evidence cites an unsupported URL: ${entry?.url}`);
    }
  }

  if (manifest.sourceFacts?.evidenceCount !== evidence.length) {
    throw new Error("manifest.sourceFacts must describe the published evidence");
  }
}
