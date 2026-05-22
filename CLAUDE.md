# Skogens Skördare — Claude Code-guide

Context för Claude-instanser som arbetar i game-repot. Det här täcker
arkitektur, viktiga konventioner, kända fallgropar och var ändringar ska
göras. Läs den vid sessionsstart innan du dyker i kod.

## Projekt

Webbaserad Three.js-multiplayer-RPG. Spelaren skördar resurser
(trä/bär/fisk), tillverkar vapen och rustning, jagar djur, slåss mot
bossar (björn/troll) och försvarar sig mot vargar på natten. Tonen är
mysig svensk-skog med voxel/box-estetik. UI och kommentarer är på
svenska.

Tillsammans med detta repo finns en **Blender asset-pipeline** i ett
separat repo. Den producerar `.glb`-filer som dropps som ZIP-paket och
extraheras hit. Asset-konventioner är dokumenterade i den repo'ns
egna `CLAUDE.md` — sammanfattat: rigs heter `PlayerRig`/`WolfRig`/etc,
animationer har specifika namn (`Wolf_Idle`, `Sword_Slash`, etc), vapen
heter `Weapon_<Name>`, rustning prefixas `AR_Silver_` / `AS_Shadow_`,
mesh-vertices är 1 enhet = 1 m.

## Stack

- **Vite 5** + ES-modules
- **Three.js r0.169** + addons (`GLTFLoader`, `SkeletonUtils`)
- **Supabase** för auth + multiplayer (`@supabase/supabase-js`)
- **socket.io** för realtime spelartillstånd
- **Node 20+**

Build/dev:

```bash
npm install           # första gången
npx vite build        # production build
npx vite dev          # dev-server (port 5173, auto-reload)
```

Build är snabb (~3 s). Använd som snabb syntax-/import-check innan
commit. Det finns ingen test-svit; verifiering sker genom build +
manuell körning i browser + ev. agent-audit för större ändringar.

## Filstruktur (vad varje fil ansvarar för)

```
src/
├─ main.js               Bootstrap: auth → game start. HannesF-flagga sätts här.
├─ game.js               Huvud-loop, AI-koordinering, kollision-resolve,
│                        camera, multiplayer-sync, terrain-snap för spelare
│                        och creatures.
├─ world.js              Marken (Blender-terräng), byn (village.glb), cave,
│                        arena, troll lair, träd, buskar, stigar. _addToScene
│                        + _snapWorldToTerrain.
├─ player.js             Spelarens GLB-laddning, equipment (sword/bow/shield/
│                        armor + shadow-varianterna), physics, animationer,
│                        chop/swing-logik.
├─ creatures.js          Bas-Creature + Rabbit/Deer/Bear/Wolf/Troll. Varje
│                        har egen AI (_decide), mixer-animation, attack.
├─ controls.js           Tangentbord + virtuell joystick. Konsumeras av game.
├─ inventory.js          Resurser och ryggsäck.
├─ upgrades.js           UPGRADES-tabell, RECIPES, BUYABLES. Levels + equipped
│                        spells.
├─ ui.js                 HUD, shop (sell/buy/upgrade/craft), ryggsäcks-
│                        panel, character-panel. Auto-equip på första köp.
├─ characterPreview.js   3D-modell i karaktärspanel. Egen scen, laddar samma
│                        GLBs som player.js.
├─ models.js             cloneModel() + loadArmorOntoSkeleton() +
│                        resetContainerTransforms(). Cache av gltf-load.
├─ resources.js          Tree/Bush/FishingSpot/Campfire — interactables.
├─ npc.js                Merchant, Anvil, Blacksmith (nya byns smed).
├─ combat.js             Arrow, HitEffect, findNearestTarget.
├─ magic.js              SPELLS-tabell, SpellProjectile, AOEEffect.
├─ daynight.js           Dag/natt-cykel (5 min). Driver sun.position och
│                        skybox-färg.
├─ save.js               localStorage i/o. Inkluderar nu player.equipped + y.
├─ auth.js, loginScreen.js, supa.js   Supabase email/lösen.
├─ net.js, remotePlayer.js            Multiplayer.
├─ mobileControls.js     Touch-UI för mobil.
└─ style.css             All UI-CSS.

public/models/           Alla .glb-assets.
├─ armor_silver.glb, armor_shadow.glb
├─ player.glb, player_silver.glb
├─ sword.glb, bow.glb, shield.glb, axe.glb
├─ shadow_sword.glb, shadow_shield.glb
├─ wolf.glb, bjorn.glb, bjorn_boss.glb
├─ village.glb, cave.glb, arena.glb
├─ world_terrain.glb, world_props.glb
├─ magi/{fireball,iceball,lightning_bolt}.glb
└─ props/{autumntree,birchtree,boulder,bush,cactus,deadtree,
          mountain,oaktree,pinetree,rock,snowymountain,stump}.glb
```

## Asset-pipeline (game-sidan)

1. Blender-instansen levererar ZIP med `.glb`-filer.
2. Identifiera nya vs ändrade via MD5 jämfört med existerande
   (`md5sum`). Bara verkligen nya filer behöver tas in.
3. Kopiera till `public/models/` (eller subkatalog).
4. Inspektera ny modell med Python innan integration:

```bash
python3 -c "
import struct, json
with open('public/models/<file>.glb','rb') as f: data = f.read()
offset=12; n=struct.unpack('<I',data[offset:offset+4])[0]
j=json.loads(data[offset+8:offset+8+n].decode('utf-8'))
print('nodes:',[n.get('name') for n in j['nodes']])
print('animations:',[a.get('name') for a in j.get('animations',[])])
# kolla rig-translation
for s in j.get('scenes',[]):
    for ni in s.get('nodes',[]):
        n=j['nodes'][ni]; print('root:', n.get('name'), 'translation:', n.get('translation'))
"
```

5. Speciellt viktigt: kolla att rig-noden inte har translation. Om
   den har, dokumentera och förlita dig på `resetContainerTransforms()`
   eller be Blender-sidan apply transforms.

## Kritiska konventioner

### Terrain-following

Spelet använder `world_terrain.glb` som mark. Allt dynamiskt y-styrt:

- **Spelaren:** `game.js` sätter `player.groundY = world.getTerrainY(x, z)`
  varje frame INNAN `updatePhysics`. `player.updatePhysics` använder
  `groundY` istället för hårdkodat `y=0`.
- **Varelser:** I `game._update` creature-loopen, efter `c.update(dt)`,
  sätts `c.position.y = world.getTerrainY(c.position.x, c.position.z)`
  + `c.group.position.y = c.position.y`. Gäller alla varelser (kaniner,
  hjortar, vargar, björn, troll).
- **Multiplayer-fjärrspelare:** Samma snap efter `rp.update(dt)`.
- **Statiska gameplay-objekt** (träd, buskar, NPC, bymesh, cave,
  arena, blommor): `World._addToScene()`-wrapper spårar varje objekt.
  `_snapWorldToTerrain()` höjer dem alla efter terrängen laddats.
  Sent-laddade objekt (cave/arena GLBs med `.then`) snappas in-line
  via `_addToScene`. Idempotent via `userData._terrainSnapped`-flagga.

**Konsekvens för ny kod:** Använd ALDRIG hårdkodat absolut `y = N`. Om
du behöver "1.5 m ovanför spelaren" → använd `game._aboveSource(pos, 1.5)`
eller skriv `pos.y + 1.5`. Aldrig `pos.setY(1.5)`.

### Authoring-offset i GLB

Tre filer har levererats med rig-translation från Blender:
`wolf.glb` (-25,0,0), `armor_shadow.glb` (-55,0,0), historiskt också
`armor_silver.glb` (fixat). Detta förskjuter modellen i scenen.

**Lösning i `models.js`: `resetContainerTransforms(root)`** — traverserar
rotnoden och nollställer position/rotation/scale på alla noder som
INTE är `isBone`, `isMesh`, eller `isSkinnedMesh`. Anropas i:
- `loadArmorOntoSkeleton()` (automatiskt)
- `Wolf._loadModel()` (explicit)

Om du laddar en ny riggad GLB och den syns på fel ställe, kör
`resetContainerTransforms(root)` precis efter `cloneModel`.

### Armor-skeleton-rebinding

`loadArmorOntoSkeleton(url, hostRoot)` laddar en armor-GLB och
återbinder dess `SkinnedMesh`es till spelarens skelett genom att
matcha bone-namn (`hand.L`, `hips`, `spine`, etc). Armor-GLB:n måste
ha **samma bone-hierarki** som `player.glb`.

`boneInverses` räknas om från armor-bones efter `resetContainerTransforms`,
så bind pose matchar spelarens. Mesh:erna flyttas till en `Group` som
läggs på `hostRoot`; toggla `group.visible` för att visa/dölja.

### Vapen som hålls i hand

`Player._attachWeapon(url, bone, opts)` letar efter första noden vars
namn börjar med `Weapon_` och nollställer dess local position/rotation
(för att kompensera för Blender-autoring där vapnet sitter en bit från
origo). Sedan `bone.add(root)`.

`opts.boostEmissive: true` multiplicerar `emissiveIntensity * 2.5` för
glow-runor på shadow-set:et.

### HannesF special

I `main.js`: `username === 'hannesf'` (lowercase) → `forceShadowArmor =
true` skickas in i Player-konstruktorn. När den är true visas shadow-
versionen av armor/sword/shield istället för silver. Silver-versionen
göms för att inte klippa. Om shadow-GLBn inte hunnit ladda används
silver som fallback (gäller sword/shield/armor).

**Rör inte denna hårdkodning utan att fråga.** Det är utvecklarens
karaktär.

### `equipped`-state och ägande

Två separata datapunkter per item:
- `upgrades.levels[key]` (0..maxLevel) — om spelaren äger items
- `player.equipped[key]` (boolean) — om det visas på karaktären

Auto-equip-paths:
- `ui.js` `_renderUpgrade` på första köp (`wasOwned === false`)
- `ui.js` `_craft` när recipe har `grantUpgrade`
- `save.js` `load` om saved data saknar `equipped` (fallback "equippa
  allt ägt")
- Manuell toggle via ryggsäcks-UI (`_bagAction('toggle-equip')`)

**Vid ny equipment-typ:** lägg till key i `Player.equipped`-init,
`Upgrades.getDefense` (om defensive), och ovanstående paths.

### Visibility-formeln (kort)

I `Player.updateAnimation`:

```js
const shadow = !!this.forceShadowArmor;
const swordOn = equipped.sword && activeWeapon === 'sword' && !isChopping;
const shieldOn = equipped.shield && activeWeapon !== 'bow' && !isChopping;
const useShadowSword = shadow && !!this._glbShadowSword;
// silver visas om vi INTE använder shadow, eller om shadow inte laddats
// shadow visas om vi använder shadow OCH den är laddad
```

### WORLD_BOUND vs SPAWN_BOUND

- `WORLD_BOUND = 700` — spelarens rörelse-clamping i `resolveCollision`
- `SPAWN_BOUND = 145` — radie inom vilken procedurella resurser
  (träd, buskar, blommor) spawnar

Anledning: terrängen är ±725. Spelaren får utforska hela världen, men
huggbara träd ligger nära centrum så player inte behöver vandra evigt.
Visuella props från `world_props.glb` fyller resten.

### Skuggor följer spelaren

`sun.target` är ett Object3D som flyttas till spelarens position varje
frame. `sun.position` adderas av `dayNight.js` (tid-baserad sol-vinkel)
ovanpå spelarens position. Resultat: ljusriktningen är konstant medan
skuggvolymen (±100 m runt sun.target) följer spelaren.

## Gameplay-positioner (referens)

| Plats        | (x, _, z)    | Radie   | Anmärkning             |
|--------------|--------------|---------|------------------------|
| Village/camp | (0, _, -14)  | 25 m    | Safezone (HP-regen 2/s) |
| Cave         | (-50, _, 30) | ~14 m   | Björnens grotta        |
| Arena        | (95, _, 75)  | ~30 m   | Loaded från arena.glb  |
| Troll lair   | (70, _, -60) | ~9 m    |                        |

Player spawnar vid `(0, _, 0)`. Sitter på village-safezonens nordliga
del (eftersom radius 25 från center -14 → innefattar 0).

## Vanliga ändringsuppgifter

### Lägg till en ny uppgradering / item

1. Lägg key i `upgrades.js` `UPGRADES`-tabellen (label, description,
   cost, maxLevel, effect-funktioner).
2. Om craftable: lägg i `RECIPES`.
3. Om direkt-köpbar resurs: lägg i `BUYABLES` + `inventory.js`.
4. Om equippable (visas på karaktär): lägg key i
   `Player.equipped`-init + visibility-logik i `updateAnimation`.
5. Om defensive: lägg i `Upgrades.getDefense`.
6. Auto-equip-path i `ui.js` `_renderUpgrade` hanterar det
   automatiskt om key finns i `player.equipped`.

### Lägg till ny varelse

1. Subklassa `Creature` i `creatures.js`. Sätt `maxHp`, `chaseSpeed`,
   `attackRange`, `attackDamage`, `attackInterval`.
2. Implementera `_decide(dt, playerPos)` för AI.
3. Implementera `tryAttack(playerPos)` om fientlig.
4. För animerad GLB: kopiera Bear/Wolf-mönstret med `_loadModel`,
   `_playAction`, `_updateAnimation`, `update()` som anropar
   `super.update` och kör mixer.
5. I `game.js`: spawn i `_spawnAnimals` / `_spawnBoss` etc. Lägg till
   i `creatures`-arrayen så terrain-snap appliceras.

### Lägg till ny spell

1. Lägg key i `magic.js` `SPELLS`-tabell (`type: 'projectile'|'aoe'`,
   `damage`, `manaCost`, `cooldown`, `color`, `meshUrl`, `castAnim`,
   `impactDelay`, `radius` för AOE).
2. För projectile: assets typ `magi/X.glb`.
3. AOE-effekter använder `originPos.y` för relativa y-offsets (`+
   0.05` för disc, `+ 1.5` för flash). ALDRIG hårdkodat y.

### Lägg till ny byggnad / miljö-GLB

1. `.glb` till `public/models/`.
2. I `world.js`: `cloneModel('/models/X.glb').then(({ root }) => {
   root.position.set(x, 0, z); this._addToScene(root); })`.
   `_addToScene` snappar y till terrängen.
3. Lägg in obstacles för 2D-kollision: `this.obstacles.push({ x, z,
   radius })`.

## Fallgropar att undvika

- **Sätt aldrig en absolut y** för en spawn-position eller effekt.
  Använd `pos.y + offset`.
- **Anropa inte `scene.add(X)` direkt i World-koden** — gå alltid via
  `this._addToScene(X)` så objektet snappar till terrängen.
- **`Player.respawn`** sätter `position.y = this.groundY`, men
  `groundY` är 0 första frame innan game.js hunnit raycasta. En
  visuell glitch på en frame är acceptabel.
- **`equipped[key] = true`** auto-sker bara på första köp (`wasOwned
  === false`). En spelare som manuellt unequippat behöver re-equippa.
- **Multiplayer remote players** har ingen GLB-modell — bara box-mesh.
  Vapen/armor synkas inte. Medvetet val (performance).
- **`world.water` finns inte längre**, men `world.update()` har
  `if (this.water)` guard så ingen krasch.
- **`upgrades.rod`** (fishing rod) finns men har ingen användning
  sedan pond togs bort. Köpbar men gör inget. Lämna kvar tills nytt
  fiske introduceras.

## Save-format

`localStorage["skogens-skordare-v2"]`:

```json
{
  "inventory": { "wood": 0, "berry": 0, ..., "gold": 0, "capacity": 10 },
  "upgrades":  { "axe": 0, "sword": 0, ..., "armor": 0 },
  "equipped":  { "sword": false, "bow": false, "shield": false, "armor": false },
  "player":    { "x": 0, "y": 0, "z": 0, "hp": 100 },
  "selectedWeapon": "sword"
}
```

Bakåtkomp: `save.load` hanterar saknad `equipped`-data genom att
auto-equippa items där `upgrades.levels[key] > 0`. Saknad y faller
till 0 (terrain-snap fixar nästa frame).

## Verifiering efter ändringar

1. `npx vite build` — fångar syntax/import-fel.
2. `npx vite dev` + browser för funktionellt test om möjligt.
3. För större ändringar: spawna en `Explore`-agent för code-audit.
   Inrikta agentet på de filer du ändrat och be om bug-fynd i
   format `BUG / IAKTTAGELSE / OK`. Triagera; fixa kritiska och
   medium; skippa rena observations.

## Git-konventioner

- Designerad utvecklings-branch: `claude/character-equipment-display-Vacy2`.
- Användaren har gett tillåtelse att också pusha till `main` direkt.
- Commit-meddelanden på svenska, första raden under 70 tecken.
- Använd HEREDOC för multi-line commit-meddelanden.
- Pusha till BÅDA branches när du committar (utvecklingsbranchen +
  main) så historiken är synk.
