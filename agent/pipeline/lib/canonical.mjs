import { createHash } from "node:crypto";

export const COMMITMENT_ALGORITHM = "sha256";
export const CANONICALIZATION = "memetoro-canonical-json-1";

/**
 * Serializes a value to the one byte sequence MemeToro commits to.
 *
 * The rules are deliberately narrow, because every ambiguity left open here is
 * a way for two parties to hash the same document differently and disagree
 * about whether published terms were changed:
 *
 * - Object keys are sorted by UTF-16 code unit, and insignificant whitespace
 *   is never emitted, so key order and formatting cannot alter the hash.
 * - Arrays keep their order, which carries meaning in evidence and candidate
 *   lists.
 * - Only safe integers are accepted. Floating point has several valid textual
 *   forms for one value, and no manifest field needs a fraction: amounts are
 *   published as base-unit strings precisely so they stay exact.
 * - `undefined`, functions, and symbols are rejected rather than skipped, so a
 *   field cannot silently vanish from the committed bytes.
 */
export function canonicalize(value) {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isSafeInteger(value)) {
        throw new Error(`Canonical JSON accepts only safe integers, received ${value}`);
      }
      return String(value);
    case "object":
      break;
    default:
      throw new Error(`Canonical JSON cannot represent a value of type ${typeof value}`);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }

  const members = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`);

  return `{${members.join(",")}}`;
}

export function digest(value) {
  return `0x${createHash(COMMITMENT_ALGORITHM).update(canonicalize(value), "utf8").digest("hex")}`;
}

/**
 * Builds the commitment for a document that does not yet carry one.
 *
 * A hash cannot cover itself, so the digest is taken over the document without
 * its commitment block. Verification removes the block again and recomputes,
 * which means any edit to any other field breaks the match.
 */
export function buildCommitment(document) {
  if (document && typeof document === "object" && "commitment" in document) {
    throw new Error("Document already carries a commitment");
  }

  return {
    algorithm: COMMITMENT_ALGORITHM,
    canonicalization: CANONICALIZATION,
    hash: digest(document),
  };
}

export function commit(document) {
  return { ...document, commitment: buildCommitment(document) };
}

export function verifyCommitment(document) {
  const commitment = document?.commitment;
  if (
    !commitment ||
    commitment.algorithm !== COMMITMENT_ALGORITHM ||
    commitment.canonicalization !== CANONICALIZATION
  ) {
    return false;
  }

  const { commitment: _present, ...body } = document;

  return digest(body) === commitment.hash;
}
