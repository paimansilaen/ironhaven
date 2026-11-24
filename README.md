# Ironhaven

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/paimansilaen/ironhaven/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/paimansilaen/ironhaven/reward.svg)](https://make.fun/bounty/gta6-01)

**Ironhaven** is an open-world crime game set in a rain-slicked industrial port city at dusk — container yards, harbor cranes, warehouses, a rust-belt downtown and a bridge over the harbor. An original game in the spirit of GTA 6, built with three.js. No Rockstar name, logo, character, map or asset anywhere: every street, name and face is original.

## Story

Mara Voss, 32, ex-getaway driver, now runs courier jobs for her late father's garage, **Voss Auto**. The garage owes **$50,000** to fixer Dell Kaine of the Harbor Crew. Eight jobs pay the debt down — and the debt leads to one last vault heist against Meridian Development Corp.

## Missions (8)

1. **First Run** — courier delivery under time, learn the drive.
2. **Night Shift** — taxi-style pickup across town.
3. **Marked** — steal a marked car and bring it to Voss Auto.
4. **The Tail** — follow a Harbor Crew truck without being spotted.
5. **Loud** — getaway chase after a job goes loud.
6. **Warehouse** — on-foot ambush: pistol and fists against four crew.
7. **Heat** — escape a 3-star wanted level to the safehouse.
8. **The Vault** — finale: crack the Meridian vault, five stars, escape to the docks.

## Systems

- Third-person on foot (WASD + mouse orbit camera, sprint) and arcade driving (acceleration, braking, steering, handbrake) in sedans, taxis, trucks, vans, sports cars and police cars.
- Traffic cars and pedestrians with simple AI — they follow the roads, avoid collisions and flee when scared.
- Car stealing, parked or occupied (the driver flees, wanted level rises).
- Wanted system, 1–5 stars: police patrol cars chase and ram, on-foot cops chase and punch; wanted decays when you break line of sight. BUSTED and WASTED flows with bail and hospital costs.
- On-foot combat: punch and pistol with ammo, health and ammo pickups.
- HUD: health, cash, debt to Dell Kaine, wanted stars, mission objective with timer and distance, speed; a 2D canvas minimap with player, police, traffic and mission blips.
- Start menu, pause, save/load via localStorage (cash, debt, mission progress), mission passed/failed screens.
- Sound: 100% WebAudio-synthesised — engine hum, police sirens, gunshots, pickups, mission stings. No audio files, no network.
- Polish: dusk lighting and fog, a low sun over the harbor, rain particles, wet-road puddles.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk / drive |
| Mouse drag | Orbit camera |
| Mouse wheel | Zoom camera |
| E | Enter / exit car (steal: walk up and press E) |
| Shift | Sprint |
| Q | Draw / holster pistol |
| Click | Shoot (pistol out) |
| F | Punch |
| Space | Handbrake |
| P / Esc | Pause |
| M | Mute sound |

## Play

Serve the `game/` folder with any static server and open it in a desktop browser — the game runs fully offline from its own files:

```sh
node serve.ts
# open http://localhost:8080
```

Screenshots are staged deterministically: `?shot=start|drive|chase|heist&seed=1` plays the real game forward from a seeded world and marks `window.__shotReady` when painted. `?selftest=1` runs the 14 automated play-tests and writes the results to `#test-results`.

## Tech

- [three.js](https://threejs.org/) r160, vendored as `game/vendor/three.min.js` (UMD build, loaded with a classic script tag).
- No build step, no dependencies, no network requests at runtime.

## License

MIT — see [LICENSE](LICENSE).
