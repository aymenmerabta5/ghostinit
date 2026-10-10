# Reviewed node-forge audit fixture

This fixture contains the node-forge 1.4.0 file inspected by GhostInit's
dependency audit, its original package manifest, and the upstream license.
It is an isolated audit input, not a complete runnable node-forge installation.

The source came from the exact npm tarball recorded in `provenance.json`. Its
SHA-512 matched both the registry metadata and the committed Expo compatibility
fixture's lock evidence. Applying the existing reviewed patch produced the
unchanged SHA-256 value enforced by the production audit. The provenance also
records the original unpatched hash so the transformation can be reproduced.

The `.fixture` file preserves exact bytes across checkouts. Unit tests read it
directly to assert the reviewed patch bytes without requiring an installed
`node_modules` tree; the Expo compatibility gate separately installs and
exercises the complete package.
