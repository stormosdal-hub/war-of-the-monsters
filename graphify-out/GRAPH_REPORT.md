# Graph Report - war-of-the-monsters  (2026-07-14)

## Corpus Check
- 23 files · ~27,322 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 281 nodes · 616 edges · 18 communities (10 shown, 8 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9e4e8ce5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

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
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]

## God Nodes (most connected - your core abstractions)
1. `Monster` - 37 edges
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

## Communities (18 total, 8 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (26): screens, buildWorld(), canvas, clearPreview(), confirmSelect(), disposeWorld(), endToVictory(), engine (+18 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (9): City, makeGroundTexture(), makeWindowTexture(), Prop, PickupManager, C3(), pick(), rand() (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.15
Nodes (3): Building, Effects, V3()

### Community 6 - "Community 6"
Cohesion: 0.48
Nodes (11): box(), buildKragmor(), buildMegaton(), buildRyzor(), buildVespera(), cyl(), finishRig(), mat() (+3 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (11): AIController, DuelCamera, MOVES, angleLerp(), clamp(), damp(), distXZ(), fwdOf() (+3 more)

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
- **40 isolated node(s):** `node`, `name`, `version`, `type`, `main` (+35 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Monster` connect `Community 2` to `Community 0`, `Community 8`, `Community 5`?**
  _High betweenness centrality (0.138) - this node is a cross-community bridge._
- **Why does `AudioSys` connect `Community 3` to `Community 0`?**
  _High betweenness centrality (0.134) - this node is a cross-community bridge._
- **Why does `V3()` connect `Community 5` to `Community 0`, `Community 2`, `Community 4`, `Community 6`, `Community 8`, `Community 17`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **What connects `node`, `name`, `version` to the rest of the system?**
  _40 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06747638326585695 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.13636363636363635 - nodes in this community are weakly interconnected._
- **Should `Community 8` be split into smaller, more focused modules?**
  _Cohesion score 0.12043010752688173 - nodes in this community are weakly interconnected._