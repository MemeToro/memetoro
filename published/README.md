# Published windows

This directory is the static publication root. The agent writes each window's committed document and image here, named after their own digests, and a launch round stores the document's public URL. Any host that keeps this layout can serve a working proposal without rewriting the files.

```text
published/
├── manifests/<sha256>.json
├── no-proposals/<sha256>.json
└── images/<sha256>.jpg
```

A manifest refers to its image as `../images/<sha256>.jpg`, relative to the manifest file. Do not move or rename a file after a round has been created against it.

`latest.json` is a local pointer to the most recent window and is ignored by Git. The on-chain URI must point at the content-addressed file, not at `latest.json`.
