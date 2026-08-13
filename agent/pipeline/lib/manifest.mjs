import { summarizeEvidence } from "./signals.mjs";
import { addHours, isIsoTimestamp, requiredString } from "./util.mjs";

export const SCHEMA_VERSION = "0.2.0";
export const LAUNCH_MANIFEST_KIND = "memetoro.launch-manifest";
export const NO_PROPOSAL_KIND = "memetoro.no-proposal";

export const LAUNCH_POLICY = Object.freeze({
  totalSupply: "1000000000",
  contributorAllocationPercent: 50,
  liquidityAllocationPercent: 50,
  insiderAllocationPercent: 0,
  fundingAsset: "BNB",
  walletCap: "1",
  minimumThreshold: "10",
  maximumThreshold: "50",
  startDelayHours: 1,
  fundingDurationHours: 24,
});

const LAUNCH_CONDITIONS = Object.freeze([
  "Funding starts and ends at the published times.",
  "The minimum funding threshold is met.",
  "The maximum funding threshold is not exceeded.",
]);

export function buildLaunchManifest({ concept, window, generatedAt, dryRun, generator }) {
  const startTime = addHours(generatedAt, LAUNCH_POLICY.startDelayHours);
  const endTime = addHours(startTime, LAUNCH_POLICY.fundingDurationHours);
  const citedEvidence = collectCitedEvidence(concept, window.signals);

  return {
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
    },
    execution: {
      launchConditions: [...LAUNCH_CONDITIONS],
      permissionlessFinalize: true,
      permissionlessRefund: true,
      backendRequired: false,
    },
    selection: buildSelectionRecord(window.signals, concept.selectedSignalIds),
    provenance: buildProvenance({ window, generatedAt, generator, dryRun }),
  };
}

export function buildNoProposalRecord({ concept, window, generatedAt, dryRun, generator }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: NO_PROPOSAL_KIND,
    status: dryRun ? "dry-run-declined" : "declined",
    declineReason: concept.declineReason,
    selection: buildSelectionRecord(window.signals, []),
    provenance: buildProvenance({ window, generatedAt, generator, dryRun }),
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

  const execution = manifest.execution ?? {};
  if (
    execution.permissionlessFinalize !== true ||
    execution.permissionlessRefund !== true ||
    execution.backendRequired !== false
  ) {
    throw new Error("Manifest execution settings violate permissionless launch policy");
  }

  return manifest;
}

export function validateNoProposalRecord(record, signals) {
  if (record?.kind !== NO_PROPOSAL_KIND) {
    throw new Error(`Record kind must be ${NO_PROPOSAL_KIND}`);
  }
  requiredString(record.declineReason, "record.declineReason");
  if (record.token || record.funding || record.execution) {
    throw new Error("A no-proposal record must not carry launch terms");
  }
  validateSelectionRecord(record.selection, signals, { requireSelection: false });

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
