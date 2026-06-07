---
tags: [dashboard, home]
banner: "00 - Dashboard/banner-dashboard.jpg"
banner-y: 0.4
---

# ⚔️ Amantia Campaign — DM Dashboard

> *A world shaped by divine madness, living gods, and a thousand years of fractured empires.*
> System: **D&D 5e (2024)** | Status: **Active**

---

## 📋 Next Session

> [!todo] Prep Checklist
> - [ ] Review last session recap in [[05 - Sessions/Recaps/Recaps|Recaps]]
> - [ ] Set in-game date using [[Amantian Calendar]]
> - [ ] Prep at least one encounter in [[06 - Encounters/06 - Encounters|Encounters]]
> - [ ] Review active plot threads in [[Campaign Tracker]]
> - [ ] Check any NPCs the party is likely to meet

---

## 🗂️ Recent Notes

```dataview
TABLE file.mtime AS "Last Edited"
FROM "" 
WHERE file.name != "🏠 Amantia DM Dashboard"
SORT file.mtime DESC
LIMIT 8
```

---

## 🎭 Active NPCs

```dataview
TABLE WITHOUT ID
  "[[" + file.name + "]]" AS NPC,
  location AS Location,
  affiliation AS Affiliation
FROM "02 - People/NPCs"
WHERE contains(tags, "npc")
SORT file.name ASC
```

---

## 📝 Sessions

```dataview
TABLE WITHOUT ID
  "[[" + file.name + "]]" AS Session,
  date AS Date,
  summary AS Summary
FROM "05 - Sessions"
WHERE contains(tags, "session")
SORT date DESC
LIMIT 5
```

---

## 🌍 The World

| | |
|--|--|
| 🗺️ [[Country Index]] | All nations of Amantia |
| 📜 [[History of Amantia]] | World history from the Elder Gods forward |
| 🗓️ [[Amantian Calendar]] | Turns, spans, days, and holidays |
| ✨ [[Cosmology & The Planes]] | Divine hierarchy, planes, and magic |
| 🧬 [[Species Index]] | All playable peoples |
| 📍 [[Cities & Locations]] | Named places |

---

## 👥 People

| | |
|--|--|
| 🧑 [[NPCs]] | All named NPCs |
| 🎭 [[Player Characters]] | The party |
| ⚔️ [[Factions & Organizations]] | Powers, guilds, and cults |

---

## ⛪ Religion

| | |
|--|--|
| 🙏 [[Deity Index]] | All known gods by pantheon |
| 🏛️ [[Religious Orders]] | Orders, sects, and cults |

---

## 🎲 Running the Game

| | |
|--|--|
| 📝 [[Session Notes]] | Session notes |
| 📖 [[Recaps]] | Player-facing recaps |
| ⚔️ [[06 - Encounters/06 - Encounters\|Encounters]] | Combat & encounter prep |
| 💎 [[07 - Items & Equipment/07 - Items & Equipment\|Items & Equipment]] | Treasure & magic items |
| 📋 [[Campaign Tracker]] | Kanban — plots, prep, ideas |
| 📚 [[Class Overview]] | Classes |
| 🎭 [[Origins Overview]] | Backgrounds & feats |

---

## 🎭 Active Plots

```dataview
TABLE WITHOUT ID
  "[[" + file.name + "]]" AS Arc,
  status AS Status,
  summary AS Summary
FROM "09 - DM Notes"
WHERE contains(tags, "plot") OR contains(tags, "arc")
SORT file.mtime DESC
```

---

## 📝 Templates

| Template | Use For |
|----------|---------|
| [[NPC Template]] | Named characters |
| [[Location Template]] | Cities, dungeons, landmarks |
| [[Session Template]] | Prep & notes each session |
| [[Encounter Template]] | Combat and social encounters |
| [[Item Template]] | Magic items & artifacts |
| [[Faction Template]] | Organisations and groups |
| [[Deity Template]] | Gods and divine beings |
| [[Country Template]] | Nations and realms |
| [[Player Character Template]] | Player characters |
| [[Arc & Plot Template]] | Story arcs |
