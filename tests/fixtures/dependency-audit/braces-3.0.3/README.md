# Reviewed braces audit fixture

This fixture contains the three braces 3.0.3 files inspected by GhostInit's
dependency audit, their original package manifest, and the upstream MIT license.
It is an isolated audit input, not a complete runnable braces installation.

The source came from the exact npm tarball recorded in `provenance.json`. Its
SHA-512 matched both the registry metadata and the committed Expo compatibility
fixture's lock evidence. Applying the existing reviewed patch produced the three
unchanged SHA-256 values enforced by the production audit. The provenance also
records the original unpatched hashes so the transformation can be reproduced.

The `.fixture` files preserve exact bytes across checkouts. Unit tests read them
directly to assert the reviewed patch bytes without requiring an installed
`node_modules` tree; the Expo compatibility gate separately installs and
exercises the complete package.
