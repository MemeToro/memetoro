import { createHash } from "node:crypto";

import { optionalString, requiredString } from "./util.mjs";

const XAI_IMAGE_ENDPOINT = "https://api.x.ai/v1/images/generations";
const REQUEST_TIMEOUT_MS = 180_000;

export const DEFAULT_IMAGE_MODEL = "grok-imagine-image-2.0";
export const MAX_IMAGE_BYTES = 5_000_000;

/**
 * Formats a published image may take, keyed by media type, with the bytes
 * every file of that type starts with. Checking the bytes means a provider
 * that mislabels its output cannot get a file published under the wrong type.
 */
export const IMAGE_FORMATS = Object.freeze({
  "image/jpeg": { extension: "jpg", matches: (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]) },
  "image/png": { extension: "png", matches: (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]) },
  "image/webp": {
    extension: "webp",
    matches: (bytes) =>
      bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
      bytes.subarray(8, 12).toString("latin1") === "WEBP",
  },
});

/**
 * Fixed in code, like the launch policy, rather than left to the model that
 * wrote the concept. Concept text is derived from untrusted signals, so the
 * rules come last and are the same for every image.
 */
export const IMAGE_RULES = Object.freeze([
  "Bold, friendly cartoon style with clean shapes, bright colours, and a plain background.",
  "Do not include any text, letters, numbers, logos, watermarks, flags, or brand marks.",
  "Do not depict real or recognisable people, including politicians and celebrities.",
  "No violence, weapons, injury, or distressing imagery.",
]);

export function buildImagePrompt(concept) {
  return [
    `An original meme illustration for "${requiredString(concept?.name, "concept.name")}".`,
    requiredString(concept.summary, "concept.summary"),
    ...IMAGE_RULES,
  ].join(" ");
}

export async function generateImage(prompt, { apiKey, model = DEFAULT_IMAGE_MODEL, fetchImpl = fetch } = {}) {
  const key = requiredString(apiKey, "XAI_API_KEY");

  let response;
  try {
    response = await fetchImpl(XAI_IMAGE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: requiredString(prompt, "image prompt"),
        n: 1,
        aspect_ratio: "1:1",
        resolution: "1k",
        quality: "medium",
        response_format: "b64_json",
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`xAI image request failed: ${error.message}`, { cause: error });
  }

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`xAI image request failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error("xAI image response was not valid JSON", { cause: error });
  }

  return readImageResponse(parsed, model);
}

export function readImageResponse(response, model) {
  const item = response?.data?.[0];
  if (typeof item?.b64_json !== "string" || !item.b64_json) {
    throw new Error("xAI image response contained no image data");
  }
  if (item.respect_moderation === false) {
    throw new Error("xAI flagged the generated image in moderation");
  }

  const bytes = Buffer.from(item.b64_json, "base64");
  return {
    bytes,
    mediaType: optionalString(item.mime_type) ?? sniffMediaType(bytes),
    revisedPrompt: optionalString(item.revised_prompt),
    model,
  };
}

/**
 * Describes image bytes the way a manifest commits to them. The file name is
 * the content hash, so the same name can never point at two different images.
 */
export function describeImage(bytes, mediaType) {
  const format = IMAGE_FORMATS[mediaType];
  if (!format) {
    throw new Error(`Unsupported image media type: ${mediaType}`);
  }
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new Error("Image is empty");
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image is ${bytes.length} bytes, above the ${MAX_IMAGE_BYTES}-byte limit`);
  }
  if (!format.matches(bytes)) {
    throw new Error(`Image bytes are not a valid ${mediaType} file`);
  }

  const hex = createHash("sha256").update(bytes).digest("hex");
  return {
    fileName: `${hex}.${format.extension}`,
    sha256: `0x${hex}`,
    mediaType,
    byteLength: bytes.length,
  };
}

export function imageMatches(image, bytes) {
  return (
    Buffer.isBuffer(bytes) &&
    bytes.length === image?.byteLength &&
    `0x${createHash("sha256").update(bytes).digest("hex")}` === image.sha256
  );
}

function sniffMediaType(bytes) {
  for (const [mediaType, format] of Object.entries(IMAGE_FORMATS)) {
    if (format.matches(bytes)) {
      return mediaType;
    }
  }
  throw new Error("xAI image response did not match a supported image format");
}

function startsWith(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}
