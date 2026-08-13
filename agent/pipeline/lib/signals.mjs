import {
  classifyLink,
  hostOf,
  normalizeUrl,
  optionalString,
  requiredString,
  isIsoTimestamp,
  unique,
  urlLookupKey,
} from "./util.mjs";

export function normalizeSignals(document) {
  if (document?.kind !== "memetoro.trend-signals") {
    throw new Error("Input kind must be memetoro.trend-signals");
  }
  if (!isIsoTimestamp(document.generatedAt)) {
    throw new Error("Input generatedAt must be an ISO-8601 timestamp");
  }

  const windowHours = Number(document.windowHours);
  if (!Number.isFinite(windowHours) || windowHours <= 0) {
    throw new Error("Input windowHours must be a positive number");
  }

  const newsSource = document.sources?.worldwideNews ?? {};
  const xSource = document.sources?.xTrends ?? {};
  const newsCandidates = newsSource.candidates ?? [];
  const xCandidates = xSource.candidates ?? [];
  if (!Array.isArray(newsCandidates) || !Array.isArray(xCandidates)) {
    throw new Error("Trend source candidates must be arrays");
  }

  const searchIndex = buildSearchIndex(newsSource.searchResults);

  const signals = [
    ...newsCandidates.map((candidate, index) =>
      normalizeNewsCandidate(candidate, `news-${index + 1}`, searchIndex),
    ),
    ...xCandidates.map((candidate, index) =>
      normalizeXCandidate(candidate, `x-${index + 1}`),
    ),
  ];

  if (signals.length === 0) {
    throw new Error("Input contains no trend candidates");
  }

  return {
    generatedAt: document.generatedAt,
    windowHours,
    signals,
  };
}

function buildSearchIndex(searchResults) {
  const index = new Map();
  if (!Array.isArray(searchResults)) {
    return index;
  }

  for (const result of searchResults) {
    const url = optionalString(result?.url);
    if (!url) {
      continue;
    }
    try {
      index.set(urlLookupKey(url), {
        title: optionalString(result.title),
        publishedDate: optionalString(result.date),
      });
    } catch {
      continue;
    }
  }

  return index;
}

function normalizeNewsCandidate(candidate, id, searchIndex) {
  const urls = candidate?.evidenceUrls;
  if (!Array.isArray(urls)) {
    throw new Error(`${id}.evidenceUrls must be an array`);
  }

  const seen = new Set();
  const evidence = [];
  for (const value of urls) {
    const url = normalizeUrl(value, `${id}.evidenceUrls`);
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    const indexed = searchIndex.get(urlLookupKey(url)) ?? {};
    evidence.push({
      url,
      linkType: classifyLink(url),
      title: indexed.title ?? null,
      publishedDate: indexed.publishedDate ?? null,
      account: null,
      note: null,
    });
  }

  return {
    id,
    sourceType: "worldwide-news",
    topic: requiredString(candidate.topic, `${id}.topic`),
    summary: requiredString(candidate.summary, `${id}.summary`),
    trendReason: requiredString(candidate.whyTrending, `${id}.whyTrending`),
    memePotential: requiredString(candidate.memePotential, `${id}.memePotential`),
    riskNotes: requiredString(candidate.riskNotes, `${id}.riskNotes`),
    keyPoints: normalizeKeyPoints(candidate.keyPoints, `${id}.keyPoints`),
    evidence,
    sourceFacts: summarizeEvidence(evidence),
  };
}

function normalizeXCandidate(candidate, id) {
  const posts = candidate?.representativePosts;
  if (!Array.isArray(posts)) {
    throw new Error(`${id}.representativePosts must be an array`);
  }

  const seen = new Set();
  const evidence = [];
  for (const post of posts) {
    const url = normalizeUrl(post?.url, `${id}.representativePosts`);
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    evidence.push({
      url,
      linkType: classifyLink(url),
      title: null,
      publishedDate: null,
      account: optionalString(post.account),
      note: optionalString(post.summary),
    });
  }

  return {
    id,
    sourceType: "x-conversation",
    topic: requiredString(candidate.topic, `${id}.topic`),
    summary: requiredString(candidate.hashtagOrPhrase, `${id}.hashtagOrPhrase`),
    trendReason: requiredString(candidate.whySpiking, `${id}.whySpiking`),
    memePotential: requiredString(candidate.memePotential, `${id}.memePotential`),
    riskNotes: requiredString(candidate.riskNotes, `${id}.riskNotes`),
    keyPoints: [],
    evidence,
    sourceFacts: summarizeEvidence(evidence),
  };
}

function normalizeKeyPoints(value, label) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((entry) => requiredString(entry, label));
}

/**
 * Counts only. Provider responses carry no post volume or impression data, so
 * any composite strength score here would be invented rather than measured.
 */
export function summarizeEvidence(evidence) {
  const domains = unique(evidence.map((entry) => hostOf(entry.url))).sort();
  const dates = evidence
    .map((entry) => entry.publishedDate)
    .filter((date) => typeof date === "string" && date)
    .sort();

  return {
    evidenceCount: evidence.length,
    distinctDomainCount: domains.length,
    distinctDomains: domains,
    permalinkCount: evidence.filter((entry) => entry.linkType === "permalink").length,
    sectionFrontCount: evidence.filter((entry) => entry.linkType === "section").length,
    datedEvidenceCount: dates.length,
    oldestSourceDate: dates.at(0) ?? null,
    newestSourceDate: dates.at(-1) ?? null,
  };
}
