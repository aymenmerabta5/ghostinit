# Reviewed image-size audit fixture

This fixture contains the two image-size 1.2.1 files inspected by GhostInit's
dependency audit, their original package manifest, and the upstream MIT license.
It is an isolated audit input, not a complete runnable image-size installation.

The source came from the exact npm tarball recorded in `provenance.json`. Its
SHA-512 matched both the registry metadata and the committed Expo compatibility
fixture's lock evidence. Applying the existing reviewed patch produced the two
unchanged SHA-256 values enforced by the production audit. The provenance also
records the original unpatched hashes so the transformation can be reproduced.

The `.fixture` files preserve exact bytes across checkouts. Unit tests copy them
into a temporary installation and run the real lock, release-age, patch, and
installed-file checks; only the external Bun advisory response is mocked. The
Expo compatibility gate separately installs and exercises the complete package.
