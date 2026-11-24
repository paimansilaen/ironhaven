# Ironhaven

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/paimansilaen/ironhaven/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/paimansilaen/ironhaven/reward.svg)](https://make.fun/bounty/gta6-01)

An open-world crime game in a rain-slicked industrial port city at dusk. Mara Voss,
32, ex-getaway driver, runs courier jobs for her late father's garage, Voss Auto —
which owes $50,000 to fixer Dell Kaine of the Harbor Crew. Eight jobs pay the debt
down, ending in one last vault heist against Meridian Development Corp.

## What is in the game

- **A city to explore**: container yards and cranes, warehouses, a rust-belt
  downtown of towers, a harbor bridge, docks, wet roads, fog, rain, and a low
  orange sun under a purple dusk sky.
- **On foot and by car**: third-person walking with an orbit camera, sprinting,
  and arcade driving (sedan, taxi, truck, van, sport, police) with handbrake
  drifts, headlights, and traffic that follows the road grid.
- **A living street**: traffic cars that slow for the car ahead, pedestrians who
  wander the sidewalks and flee gunshots and speeding cars.
- **Wanted, 0–5 stars**: stealing a car, hitting a pedestrian, or ramming a
  police car raises the heat. Patrol cars chase and ram; on-foot cops chase and
  punch. Lose sight of them and the heat cools off. Get caught slow on foot and
  you are BUSTED; hit zero health and you are WASTED.
- **Combat**: fists and a pistol (raycast along the camera), ammo and reload,
  health and ammo pickups scattered around the city.
- **Eight missions with a story**: courier runs, a taxi fare, a stolen sport car,
  a tail job, two police escapes, a warehouse ambush, and the Meridian vault
  heist — $50,000 of debt paydown in total, tracked on the HUD.
- **HUD and minimap**: health, ammo, cash, remaining debt, wanted stars,
  objective and timer, speed, and a live top-down minimap with the mission
  blip, police, and traffic.
- **Menus and saves**: title screen, pause, BUSTED/WASTED retries, a
  story-complete screen, and localStorage saves with a Continue button.
- **Sound, synthesised**: engine hum pitched by speed, two-tone sirens,
  gunshots, pickup blips, and mission stings — all WebAudio, no audio files.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move on foot, drive |
| Mouse drag | Orbit camera |
| Mouse wheel | Zoom camera |
| Shift | Sprint |
| Space | Handbrake drift |
| E | Enter / exit car, grab the vault cash |
| F | Punch |
| Mouse click | Fire pistol |
| R | Reload |
| Esc | Pause |

## Play

Serve `game/` with any static server (for example `node serve.ts`, then open
`http://localhost:8080`) and press Start. Everything the game loads lives under
`game/`; it makes no network requests. three.js is vendored under
`game/vendor/three.min.js`.

MIT licensed. All names, characters, and places are original.
