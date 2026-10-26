import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { imageMatches } from "./image.mjs";
import { LAUNCH_MANIFEST_KIND, NO_PROPOSAL_KIND, PUBLICATION_LAYOUT } from "./manifest.mjs";

/**
 * Lays out a produced document and its image as published files.
 *
 * Every file is named after its own digest, so publishing never overwrites
 * anything and a name can only ever refer to one set of bytes.
 */
export function publicationFiles({ document, image }) {
  const hex = document.commitment.hash.slice(2);
  let folder;
  if (document.kind === LAUNCH_MANIFEST_KIND) {
    folder = PUBLICATION_LAYOUT.manifests;
  } else if (document.kind === NO_PROPOSAL_KIND) {
    folder = PUBLICATION_LAYOUT.noProposals;
  } else {
    throw new Error(`Cannot publish unknown document kind: ${document.kind}`);
  }

  const files = [
    {
      path: `${folder}/${hex}.json`,
      contents: Buffer.from(`${JSON.stringify(document, null, 2)}\n`, "utf8"),
    },
  ];

  if (document.kind === LAUNCH_MANIFEST_KIND) {
    if (!image || !imageMatches(document.visual.image, image.bytes)) {
      throw new Error("The image bytes do not match the manifest's committed image");
    }
    files.push({
      path: `${PUBLICATION_LAYOUT.images}/${image.fileName}`,
      contents: image.bytes,
    });
  }

  return files;
}

export async function writePublication(directory, files) {
  for (const file of files) {
    const target = resolve(directory, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.contents);
  }
}
