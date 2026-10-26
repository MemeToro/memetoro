import { validateConcept } from "./concept.mjs";
import { buildImagePrompt, describeImage } from "./image.mjs";
import {
  buildLaunchManifest,
  buildNoProposalRecord,
  validateLaunchManifest,
  validateNoProposalRecord,
} from "./manifest.mjs";

/**
 * Turns a model's concept into the committed document the agent publishes,
 * plus the image bytes for a proposal.
 *
 * `createImage(prompt)` is injected so the command line can use a frozen
 * fixture and the hourly runner a live model through the same path. A decline
 * never asks for an image.
 */
export async function produceDocument({
  window,
  rawConcept,
  generatedAt,
  dryRun,
  generator,
  policy,
  createImage,
}) {
  const concept = validateConcept(rawConcept, window.signals);
  const context = { concept, window, generatedAt, dryRun, generator, policy };

  if (concept.decision === "decline") {
    return {
      document: validateNoProposalRecord(buildNoProposalRecord(context), window.signals),
      image: null,
    };
  }

  const prompt = buildImagePrompt(concept);
  const generated = await createImage(prompt);
  const image = describeImage(generated.bytes, generated.mediaType);
  const visual = {
    prompt,
    revisedPrompt: generated.revisedPrompt ?? null,
    generator: dryRun ? "fixture" : generated.model,
    image,
  };

  return {
    document: validateLaunchManifest(buildLaunchManifest({ ...context, visual }), window.signals),
    image: { ...image, bytes: generated.bytes },
  };
}
