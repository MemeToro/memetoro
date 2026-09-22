export function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

export function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeUrl(value, label) {
  const raw = requiredString(value, label);
  try {
    return new URL(raw).toString();
  } catch (error) {
    throw new Error(`${label} contains an invalid URL: ${raw}`, { cause: error });
  }
}

export function hostOf(value) {
  return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
}

export function urlLookupKey(value) {
  const url = new URL(value);
  return `${hostOf(value)}${url.pathname.replace(/\/+$/, "").toLowerCase()}`;
}

/**
 * Heuristic split between a specific document and a publisher section front.
 * Section fronts stay reachable forever and therefore prove nothing, so they
 * are counted separately rather than silently treated as supporting evidence.
 */
export function classifyLink(value) {
  const path = new URL(value).pathname.replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);
  const lastSegment = segments.at(-1) ?? "";
  const hasDatePath = /\/\d{4}\/\d{1,2}\//.test(`${path}/`);
  const hasLongIdentifier = /\d{6,}/.test(lastSegment);
  const hyphenCount = (lastSegment.match(/-/g) ?? []).length;

  return hasDatePath || hasLongIdentifier || hyphenCount >= 3 ? "permalink" : "section";
}

export function isIsoTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function addHours(timestamp, hours) {
  return new Date(Date.parse(timestamp) + hours * 60 * 60 * 1000).toISOString();
}

/**
 * Drops sub-second precision so a timestamp has one exact representation both
 * as an ISO string and as the whole-second integer a contract stores.
 */
export function floorToSecond(timestamp) {
  const milliseconds = Date.parse(timestamp);
  if (Number.isNaN(milliseconds)) {
    throw new Error(`Not a timestamp: ${timestamp}`);
  }
  return new Date(milliseconds - (milliseconds % 1000)).toISOString();
}

export function toUnixSeconds(timestamp) {
  const milliseconds = Date.parse(timestamp);
  if (Number.isNaN(milliseconds)) {
    throw new Error(`Not a timestamp: ${timestamp}`);
  }
  if (milliseconds % 1000 !== 0) {
    throw new Error(`Timestamp must be whole seconds to convert exactly: ${timestamp}`);
  }
  return milliseconds / 1000;
}

/**
 * Converts a decimal amount to integer base units through string arithmetic.
 * Doing this with numbers would round a value such as 0.1 before it ever
 * reached the manifest, and published funding terms have to be exact.
 */
export function toBaseUnits(amount, decimals) {
  const value = requiredString(amount, "amount");
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error(`Amount must be a non-negative decimal string: ${value}`);
  }

  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) {
    throw new Error(`Amount has more than ${decimals} decimal places: ${value}`);
  }

  return BigInt(`${whole}${fraction.padEnd(decimals, "0")}`).toString();
}

export function unique(values) {
  return [...new Set(values)];
}
