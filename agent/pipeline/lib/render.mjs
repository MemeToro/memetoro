import { LAUNCH_MANIFEST_KIND, NO_PROPOSAL_KIND } from "./manifest.mjs";

const DRAFT_WARNING =
  "Draft output from an experimental agent. The launch contracts are not implemented, audited, or deployed, so nothing here can accept funds. Summaries and risk notes below are model-written and unverified.";

/**
 * Deterministic manifest renderer. The manifest stays the single source of
 * truth for launch terms; this view is a pure function of it so the readable
 * page cannot drift from the terms the contracts would enforce.
 */
export function renderMarkdown(document) {
  if (document?.kind === NO_PROPOSAL_KIND) {
    return renderNoProposal(document);
  }
  if (document?.kind === LAUNCH_MANIFEST_KIND) {
    return renderLaunchManifest(document);
  }
  throw new Error(`Cannot render unknown document kind: ${document?.kind}`);
}

function renderLaunchManifest(manifest) {
  const { concept, funding, token, execution, selection, provenance } = manifest;

  return [
    `# ${concept.name} (${concept.symbol})`,
    "",
    `> ${DRAFT_WARNING}`,
    "",
    `Status: **${manifest.status}**`,
    "",
    "## Concept",
    "",
    concept.summary,
    "",
    "## Why this signal",
    "",
    concept.marketReasoning,
    "",
    "## Stated risks",
    "",
    concept.riskAssessment,
    "",
    "## Evidence",
    "",
    ...manifest.evidence.map(renderEvidenceLine),
    "",
    "## Source facts",
    "",
    ...renderSourceFacts(manifest.sourceFacts, provenance),
    "",
    "## Signals considered",
    "",
    ...renderCandidateTable(selection),
    "",
    "## Draft launch terms",
    "",
    "| Item | Value |",
    "| --- | --- |",
    `| Total supply | ${token.totalSupply} |`,
    `| Contributor allocation | ${token.contributorAllocationPercent}% |`,
    `| Liquidity allocation | ${token.liquidityAllocationPercent}% |`,
    `| Insider allocation | ${token.insiderAllocationPercent}% |`,
    `| Funding asset | ${funding.asset} |`,
    `| Per-wallet cap | ${funding.walletCap} ${funding.asset} |`,
    `| Minimum threshold | ${funding.minimumThreshold} ${funding.asset} |`,
    `| Maximum threshold | ${funding.maximumThreshold} ${funding.asset} |`,
    `| Funding opens | ${funding.startTime} |`,
    `| Funding closes | ${funding.endTime} |`,
    "",
    "## Launch conditions",
    "",
    ...execution.launchConditions.map((condition) => `- ${condition}`),
    `- Anyone can finalize: ${yesNo(execution.permissionlessFinalize)}`,
    `- Anyone can refund: ${yesNo(execution.permissionlessRefund)}`,
    `- Backend required: ${yesNo(execution.backendRequired)}`,
    "",
    "## Provenance",
    "",
    ...renderProvenance(provenance),
    "",
  ].join("\n");
}

function renderNoProposal(record) {
  return [
    "# No proposal for this window",
    "",
    `> ${DRAFT_WARNING}`,
    "",
    `Status: **${record.status}**`,
    "",
    "## Why no concept was proposed",
    "",
    record.declineReason,
    "",
    "## Signals considered",
    "",
    ...renderCandidateTable(record.selection),
    "",
    "## Provenance",
    "",
    ...renderProvenance(record.provenance),
    "",
  ].join("\n");
}

function renderEvidenceLine(entry) {
  const label = entry.title ?? entry.account ?? entry.url;
  const details = [entry.linkType === "section" ? "publisher section front" : "permalink"];
  if (entry.publishedDate) {
    details.push(`dated ${entry.publishedDate}`);
  }
  if (entry.account && entry.title) {
    details.push(entry.account);
  }
  const suffix = entry.note ? ` — ${entry.note}` : "";

  return `- [${label}](${entry.url}) — ${details.join(", ")}${suffix}`;
}

function renderSourceFacts(facts, provenance) {
  const lines = [
    `- ${facts.evidenceCount} cited link(s) across ${facts.distinctDomainCount} domain(s): ${facts.distinctDomains.join(", ")}`,
    `- ${facts.permalinkCount} link(s) point at a specific post or article; ${facts.sectionFrontCount} point at a publisher section front`,
    `- ${facts.datedEvidenceCount} of ${facts.evidenceCount} link(s) carry a publication date`,
  ];

  if (facts.oldestSourceDate && facts.newestSourceDate) {
    lines.push(`- Dated sources range from ${facts.oldestSourceDate} to ${facts.newestSourceDate}`);
  }

  lines.push(
    `- Collected from a ${provenance.windowHours}-hour window ending ${provenance.signalsGeneratedAt}`,
    "- No post volume, impression, or engagement figures are available from the collection sources, so no strength score is published",
  );

  return lines;
}

function renderCandidateTable(selection) {
  return [
    `The agent had ${selection.consideredCount} candidate signal(s) available.`,
    "",
    "| Signal | Source | Topic | Links | Selected | Stated risks |",
    "| --- | --- | --- | --- | --- | --- |",
    ...selection.candidates.map(
      (candidate) =>
        `| ${candidate.id} | ${candidate.sourceType} | ${escapeCell(candidate.topic)} | ${candidate.sourceFacts.evidenceCount} | ${yesNo(candidate.selected)} | ${escapeCell(candidate.riskNotes)} |`,
    ),
  ];
}

function renderProvenance(provenance) {
  return [
    `- Generated at: ${provenance.generatedAt}`,
    `- Signals collected at: ${provenance.signalsGeneratedAt}`,
    `- Collection window: ${provenance.windowHours} hours`,
    `- Concept generator: ${provenance.generator}`,
  ];
}

function escapeCell(value) {
  return value.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

function yesNo(value) {
  return value ? "yes" : "no";
}
