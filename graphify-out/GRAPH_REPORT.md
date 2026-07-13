# Graph Report - war-of-the-monsters  (2026-07-13)

## Corpus Check
- 23 files · ~26,591 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 275 nodes · 598 edges · 16 communities (9 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b9286944`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
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
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]

## God Nodes (most connected - your core abstractions)
1. `Monster` - 35 edges
2. `V3()` - 34 edges
3. `AudioSys` - 25 edges
4. `rand()` - 20 edges
5. `C3()` - 19 edges
6. `clamp()` - 19 edges
7. `City` - 17 edges
8. `GyroSteer` - 15 edges
9. `DuelCamera` - 11 edges
10. `Effects` - 11 edges

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

## Communities (16 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (24): HUD, screens, buildWorld(), canvas, clearPreview(), confirmSelect(), disposeWorld(), engine (+16 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (10): Building, City, makeGroundTexture(), makeWindowTexture(), Prop, PickupManager, C3(), pick() (+2 more)

### Community 6 - "Community 6"
Cohesion: 0.48
Nodes (11): box(), buildKragmor(), buildMegaton(), buildRyzor(), buildVespera(), cyl(), finishRig(), mat() (+3 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (14): AIController, DuelCamera, MOVES, ProjectileManager, angleLerp(), clamp(), damp(), distToCapsule() (+6 more)

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (6): dependencies, @modelcontextprotocol/sdk, main, name, type, version

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (6): Code layout, COLOSSAL FURY, Controls, On a phone, Run it, The game

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (10): background_color, description, display, icons, name, orientation, scope, short_name (+2 more)

### Community 12 - "Community 12"
Cohesion: 0.40
Nodes (4): __dirname, server, transport, VAULT

### Community 15 - "Community 15"
Cohesion: 0.33
Nodes (4): DEFAULTS, load(), save(), Settings

## Knowledge Gaps
- **39 isolated node(s):** `node`, `name`, `version`, `type`, `main` (+34 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AudioSys` connect `Community 3` to `Community 0`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **Why does `Monster` connect `Community 2` to `Community 0`, `Community 8`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Why does `V3()` connect `Community 8` to `Community 0`, `Community 2`, `Community 4`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **What connects `node`, `name`, `version` to the rest of the system?**
  _39 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05919661733615222 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.10188261351052048 - nodes in this community are weakly interconnected._
- **Should `Community 8` be split into smaller, more focused modules?**
  _Cohesion score 0.10512820512820513 - nodes in this community are weakly interconnected._