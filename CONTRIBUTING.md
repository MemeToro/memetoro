# Contributing to MemeToro

Contributions are welcome while MemeToro is in its early design stage.

1. Create a branch from the current default branch, using a descriptive name such as `feature/news-source`.
2. Make focused changes that address one concern at a time.
3. Update relevant documentation whenever behavior, architecture, or assumptions change.
4. Run any available checks and review your diff.
5. Open a pull request that clearly explains the purpose, scope, and verification of the change.

Never commit private keys, seed phrases, API secrets, populated environment files, or other credentials. If a secret is committed accidentally, revoke it immediately and report the exposure through the project's security disclosure channel once available.

## Data-source changes

Keep connectors under `agent/data-sources/`, document their provider and runtime requirements, and avoid unnecessary packages. Tests should use sanitized fixtures by default rather than paid or credentialed live requests. Credentials belong in the single repository-root `.env`; add any new variable to the root `.env.example` instead of creating a per-directory example. Never commit a populated `.env` or generated local output.
