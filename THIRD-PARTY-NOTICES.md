# Sources and third-party notices

This addon contains derivative source code under **GPL-3.0-or-later**. The full
licence is in [LICENSE](LICENSE). Existing source-file notices remain applicable;
the addon does not claim exclusive authorship over upstream work.

## Stronghold-Protocol

- Project: [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol)
- Authors: sganggs and Stronghold-Protocol contributors.
- Supported upstream base: commit `b3deebdae4a92642c007d217a1a4573e5d3612c5` (0.3.1).
- Additional compatibility target: commit `f07b8965061bbc311ad7aa815879b09264a1e47d`
  (0.3.3, the latest official release checked on 2026-10-25). Compatibility is
  limited to the exact source hashes accepted by `addon-manifest.json`.
- Original notice: `Copyright (C) 2026 Stronghold-Protocol contributors`.
- Licence: GPL-3.0-or-later, with the upstream additional permission under section 7
  for combinations with the Spine Runtimes. This addon does not bundle Spine Runtimes.
- Use: original battle/economy APIs, policy support code, and narrowly scoped host
  integration. The host game, its generated game data and installed dependencies
  are obtained separately, rather than copied into this addon.

The upstream additional permission is retained as follows:

> If you modify this Program, or any covered work, by linking or combining it with the Spine Runtimes (as shipped in
> pixi-spine, or a modified version of them), containing parts covered by the terms of the Spine Runtimes License
> Agreement, the licensors of this Program grant you additional permission to convey the resulting work.
> Corresponding Source for a non-source form of such a combination shall include the source code for the parts of
> the Spine Runtimes used as well as that of the covered work.

## Stronghold-Protocol-AI

- Project: [HankDUMPLINGZhong/Stronghold-Protocol-AI](https://github.com/HankDUMPLINGZhong/Stronghold-Protocol-AI)
- Author/maintainer: HankDUMPLINGZhong; upstream Stronghold-Protocol authors and
  contributors retain their rights in derivative code.
- Pinned source: `4115c0f228e5c38eae4bf88b24b50ae5c57e4d9e`.
- Policy snapshots: Arturia 0.2.4 and Lavinia 0.1.2.
- Licence: GPL-3.0-or-later.
- Use: strategy policy cores and state-machine structure. Original supplier
  licence/notice files and provenance accompany any bundled supplier source.
  Local adaptations and route allocation are identified separately.

### Original snapshots and distributed adaptations

The supplier's `UPSTREAM72.json` files are preserved as historical records of
the **original** released snapshots. Their original hashes and "unmodified"
note apply to those source snapshots, not to every distributed file here.
Relative imports have been adapted for this addon's directory layout, and local
policy/integration changes are marked in the source and root
[`provenance.json`](provenance.json). That file distinguishes original source
hashes from distributed hashes. Installation validates the distributed bytes
through `addon-manifest.json`; it does not use the original supplier hashes as
checksums of adapted files.

## Game assets and names

Arknights and its characters, names, game data, portraits, models, graphics,
music and voices belong to their respective rights holders, including Hypergryph
and its authorised partners. No standalone game artwork, audio, generated game-data bundle,
personal save or player recording is distributed here. One reviewed static gameplay
preview is included at `docs/media/public-addon-preview.webp` solely to illustrate
the public addon running on the host. Its game imagery remains owned by the respective
rights holders; this repository grants no standalone game-asset licence. No extracted
asset pack is included. The addon reuses asset
identifiers already provided by a separately installed host game.

This is an unofficial, non-commercial fan extension. It is not affiliated with,
endorsed by, or authorised by the original game's rights holders.

## Tools and runtime

The public addon uses Node.js built-in APIs; it does not bundle Node.js or npm
dependencies. The supported host retains responsibility for its own dependencies
and notices. CI references GitHub's official `actions/checkout` and
`actions/setup-node` by fixed public commit, without vendoring them or adding a
publishing workflow.

Exact copied-file and installed-file hashes are recorded in the source provenance
and addon manifests. Those lists describe source derivation; they contain no
machine-specific installation paths or private training material.
