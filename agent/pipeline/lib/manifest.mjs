import { commit, verifyCommitment } from "./canonical.mjs";
import { summarizeEvidence } from "./signals.mjs";
import {
  addHours,
  floorToSecond,
  isIsoTimestamp,
  requiredString,
  toBaseUnits,
  toUnixSeconds,
} from "./util.mjs";

export const SCHEMA_VERSION = "0.3.0";
export const LAUNCH_MANIFEST_KIND = "memetoro.launch-manifest";
export const NO_PROPOSAL_KIND = "memetoro.no-proposal";

export const LAUNCH_POLICY = Object.freeze({
  totalSupply: "1000000000",
  tokenDecimals: 18,
  contributorAllocationPercent: 50,
  liquidityAllocationPercent: 50,
  insiderAllocationPercent: 0,
  fundingAsset: "BNB",
  fundingAssetDecimals: 18,
  walletCap: "1",
  minimumThreshold: "10",
  maximumThreshold: "50",
  startDelayHours: 1,
  fundingDurationHours: 24,
  exitWindowHours: 12,
  finalizeGracePeriodHours: 168,
});

const LAUNCH_CONDITIONS = Object.freeze([
  "Funding starts and ends at the published times.",
  "Contributions can be withdrawn until the published exit deadline.",
  "No launch happens before the exit deadline.",
  "The minimum funding threshold is met.",
  "The maximum funding threshold is not exceeded.",
]);

export function buildLaunchManifest({ concept, window, generatedAt, dryRun, generator }) {
  // Second precision throughout, so the published ISO timestamp and the
  // integer a contract stores describe the same instant exactly.
  const startTime = floorToSecond(addHours(generatedAt, LAUNCH_POLICY.startDelayHours));
  const endTime = addHours(startTime, LAUNCH_POLICY.fundingDurationHours);
  const exitDeadline = addHours(startTime, LAUNCH_POLICY.exitWindowHours);
  const citedEvidence = collectCitedEvidence(concept, window.signals);

  return commit({
    schemaVersion: SCHEMA_VERSION,
    kind: LAUNCH_MANIFEST_KIND,
    status: dryRun ? "dry-run" : "draft",
    concept: {
      name: concept.name,
      symbol: concept.symbol,
      summary: concept.summary,
      marketReasoning: concept.reasoning,
      riskAssessment: concept.riskAssessment,
    },
    evidence: citedEvidence,
    sourceFacts: summarizeEvidence(citedEvidence),
    token: {
      totalSupply: LAUNCH_POLICY.totalSupply,
      contributorAllocationPercent: LAUNCH_POLICY.contributorAllocationPercent,
      liquidityAllocationPercent: LAUNCH_POLICY.liquidityAllocationPercent,
      insiderAllocationPercent: LAUNCH_POLICY.insiderAllocationPercent,
    },
    funding: {
      asset: LAUNCH_POLICY.fundingAsset,
      walletCap: LAUNCH_POLICY.walletCap,
      minimumThreshold: LAUNCH_POLICY.minimumThreshold,
      maximumThreshold: LAUNCH_POLICY.maximumThreshold,
      startTime,
      endTime,
      exitDeadline,
    },
    chainTerms: buildChainTerms({ startTime, endTime, exitDeadline }),
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
function buildChainTerms({ startTime, endTime, exitDeadline }) {
  const { fundingAssetDecimals, tokenDecimals } = LAUNCH_POLICY;

  return {
    walletCapWei: toBaseUnits(LAUNCH_POLICY.walletCap, fundingAssetDecimals),
    minimumThresholdWei: toBaseUnits(LAUNCH_POLICY.minimumThreshold, fundingAssetDecimals),
    maximumThresholdWei: toBaseUnits(LAUNCH_POLICY.maximumThreshold, fundingAssetDecimals),
    startTime: toUnixSeconds(startTime),
    endTime: toUnixSeconds(endTime),
    exitDeadline: toUnixSeconds(exitDeadline),
    finalizeGracePeriodSeconds: LAUNCH_POLICY.finalizeGracePeriodHours * 3600,
    tokenDecimals,
    tokenTotalSupplyBaseUnits: toBaseUnits(LAUNCH_POLICY.totalSupply, tokenDecimals),
    contributorAllocationBps: LAUNCH_POLICY.contributorAllocationPercent * 100,
    liquidityAllocationBps: LAUNCH_POLICY.liquidityAllocationPercent * 100,
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

  const expected = {
    walletCapWei: toBaseUnits(funding.walletCap, LAUNCH_POLICY.fundingAssetDecimals),
    minimumThresholdWei: toBaseUnits(funding.minimumThreshold, LAUNCH_POLICY.fundingAssetDecimals),
    maximumThresholdWei: toBaseUnits(funding.maximumThreshold, LAUNCH_POLICY.fundingAssetDecimals),
    startTime: toUnixSeconds(funding.startTime),
    endTime: toUnixSeconds(funding.endTime),
    exitDeadline: toUnixSeconds(funding.exitDeadline),
    tokenDecimals: LAUNCH_POLICY.tokenDecimals,
    tokenTotalSupplyBaseUnits: toBaseUnits(token.totalSupply, LAUNCH_POLICY.tokenDecimals),
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
