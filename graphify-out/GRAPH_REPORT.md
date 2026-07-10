# Graph Report - war-of-the-monsters  (2026-07-10)

## Corpus Check
- 19 files · ~16,703 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 215 nodes · 512 edges · 15 communities (8 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]

## God Nodes (most connected - your core abstractions)
1. `V3()` - 34 edges
2. `Monster` - 33 edges
3. `AudioSys` - 24 edges
4. `rand()` - 20 edges
5. `C3()` - 19 edges
6. `City` - 17 edges
7. `clamp()` - 16 edges
8. `Effects` - 11 edges
9. `Building` - 9 edges
10. `HUD` - 8 edges

## Surprising Connections (you probably didn't know these)
- `buildWorld()` --calls--> `V3()`  [EXTRACTED]
  src/main.js → src/util.js
- `startMatch()` --calls--> `V3()`  [EXTRACTED]
  src/main.js → src/util.js
- `mat()` --calls--> `C3()`  [EXTRACTED]
  src/monsters.js → src/util.js
- `buildKragmor()` --calls--> `rand()`  [EXTRACTED]
  src/monsters.js → src/util.js
- `makeGroundTexture()` --calls--> `rand()`  [EXTRACTED]
  src/city.js → src/util.js

## Import Cycles
- None detected.

## Communities (15 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (22): HUD, screens, buildWorld(), canvas, clearPreview(), confirmSelect(), disposeWorld(), engine (+14 more)

### Community 1 - "Community 1"
Cohesion: 0.14
Nodes (15): AIController, DuelCamera, makeGroundTexture(), MOVES, clamp(), damp(), distXZ(), fwdOf() (+7 more)

### Community 2 - "Community 2"
Cohesion: 0.20
Nodes (3): Monster, angleLerp(), yawTo()

### Community 4 - "Community 4"
Cohesion: 0.28
Nodes (3): City, makeWindowTexture(), C3()

### Community 6 - "Community 6"
Cohesion: 0.56
Nodes (10): box(), buildKragmor(), buildMegaton(), buildRyzor(), buildVespera(), cyl(), finishRig(), mat() (+2 more)

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (6): dependencies, @modelcontextprotocol/sdk, main, name, type, version

### Community 10 - "Community 10"
Cohesion: 0.33
Nodes (5): Code layout, COLOSSAL FURY, Controls, Run it, The game

### Community 12 - "Community 12"
Cohesion: 0.40
Nodes (4): __dirname, server, transport, VAULT

## Knowledge Gaps
- **25 isolated node(s):** `node`, `name`, `version`, `type`, `main` (+20 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AudioSys` connect `Community 3` to `Community 0`?**
  _High betweenness centrality (0.168) - this node is a cross-community bridge._
- **Why does `Monster` connect `Community 2` to `Community 0`, `Community 1`?**
  _High betweenness centrality (0.145) - this node is a cross-community bridge._
- **Why does `V3()` connect `Community 1` to `Community 0`, `Community 2`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 11`?**
  _High betweenness centrality (0.133) - this node is a cross-community bridge._
- **What connects `node`, `name`, `version` to the rest of the system?**
  _25 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07112375533428165 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.13903743315508021 - nodes in this community are weakly interconnected._