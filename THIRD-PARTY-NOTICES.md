# Distribution notices and scope

CachyMusic source declares GPL-3.0-or-later; the full license is included as `LICENSE`. Source, scripts and project assets are delivered together. This notice records dependencies, not legal certification or a claim of ownership of every upstream component.

The previous NMS Futura-derived font binary is no longer included. The NMS community project declares SIL OFL 1.1 for its font but documents a relation to a game-derived Futura typeface. The exact binary's chain of rights was not independently established. The application uses installed fonts; no font download or redistribution is required. Upstream references: https://font.nmscd.com/ and https://nmscd.com/ .

| Component | Source kit treatment | Declared version or selection |
|---|---|---|
| PHP and Python | System runtime, not bundled | PHP >=8.1, Python >=3.10 |
| Browser/WebView | System runtime, not bundled | Target platform selection |
| FFmpeg/ffprobe | Optional system executables, not bundled | Installed build; codec configuration varies |
| slsk-client | Optional separately resolved npm dependency, not bundled | 2.0.2 |
| AndroidX WebKit | Android build dependency, not bundled in source | 1.10.0 |
| AndroidX DocumentFile | Android build dependency, not bundled in source | 1.0.1 |
| Android Gradle Plugin / Gradle | Build tools, not bundled | See Android build configuration |
| Electron | External portable runtime, not bundled | Maintainer must supply exact reviewed distribution |
| MusicBrainz, Cover Art Archive, LRCLIB | User-initiated external services, not bundled | Service terms and provider data rights apply |

No music, remote provider artwork, audio captures, private library or dependency binaries are shipped in the source kit. The existing project-generated-style icons and SVG artwork remain part of the project source; their historical authorship chain has not been independently verified. No trademark endorsement is implied.

For a portable build, supply `DEPENDENCIES.json` entries with name, version, declared license, public HTTPS source, tree (`electron`, `runtime` or `runtime-core`, `node-modules`), nonempty `notices` paths under `LICENSES/`, and `files` mapping every relative input file to its SHA-256. Resolve symlinks into a reviewed real input directory first. For core-only, omit the Node subtree and node-modules entry; use `runtime-core`. Unlisted or changed files are rejected. This verifies supplied bytes against the reviewed manifest, not the truth of provenance or legal assertions. Include the complete applicable licenses, notices and corresponding source where required by actual distributed binaries. The npm lock audit and native build/packaged dependency review remain separate gates.
