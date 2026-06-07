# ⚙️ Step 3 — Plugin & Settings Setup

Work through this top to bottom. Each section has a checkbox — tick it off when done.
The guide says *"don't go overboard"* — so this list is ordered by value to you right now.

---

## Part 1 — Core Settings (built-in, no install needed)

Open **Settings** (gear icon bottom-left, or `Ctrl+,`)

### 1.1 — Point Templates to your folder
- [x] Go to **Settings → Core Plugins → Templates** → toggle ON
- [x] Set **Template folder location** to: `Templates`

### 1.2 — Enable these Core Plugins
Go to **Settings → Core Plugins** and toggle ON:

- [x] **Templates** *(done above)*
- [x] **Backlinks** — shows what links to the current note
- [x] **Outgoing links** — shows what the current note links to
- [x] **Page preview** — hover over a `[[link]]` to preview it
- [x] **Graph view** — visual map of all your linked notes
- [x] **Tags** — sidebar tag browser
- [x] **Search** — should already be on
- [x] **File recovery** — auto-backups of your notes

### 1.3 — File & Link Settings
Go to **Settings → Files & Links**:

- [x] Set **New link format** to: `Shortest path when possible`
- [x] Toggle ON: **Automatically update internal links** (when you rename a file, links update)
- [x] Set **Default location for new notes** to: `In the folder specified below` → `09 - DM Notes` (or wherever you want scratch notes to land)

### 1.4 — Editor Settings
Go to **Settings → Editor**:

- [x] Toggle ON: **Readable line length** (stops text stretching across the full width)
- [x] Toggle ON: **Spell check** (catches typos in session notes)

---

## Part 2 — Theme (Appearance)

The guide specifically recommends the **ITS Theme** by SlRvb — designed for TTRPG use.

- [x] Go to **Settings → Appearance → Themes → Manage**
- [x] Search for: `ITS Theme`
- [x] Click **Install and use**

> [!tip] What ITS Theme adds
> - Resize and align images (left, right, centre, grid)
> - Wiki-style info tables on the right side of notes
> - TTRPG-specific callout styles
> - Dark and light mode both look great

Once installed, explore **Settings → Appearance → Style Settings** (appears after install) to tweak colors.

---

## Part 3 — Community Plugins

First, enable community plugins:
- [x] Go to **Settings → Community Plugins**
- [x] Click **Turn on community plugins** and confirm

Then install each plugin by clicking **Browse** and searching the name.

---

### 🔴 Install First (highest DM value)

#### Templater *(by SilentVoid)*
Supercharges templates beyond what core Templates can do. Auto-fills dates, prompts for input, runs scripts.
- [x] Install & enable
- [x] Go to **Settings → Templater** → set **Template folder** to `Templates`
- [x] Toggle ON: **Trigger Templater on new file creation**

> [!note] Why over core Templates?
> Lets you do things like auto-insert today's date, auto-set the session number, and prompt "What's this NPC's name?" when creating from a template.

---

#### Fantasy Statblocks *(by javalent)*
Renders full D&D 5e monster stat blocks inside your notes using a simple code block. Essential for encounter prep.
- [x] Install & enable
- [x] No additional setup needed — works immediately

**Usage:** In any note, create a code block with ` ```statblock ` and fill in the fields.

```
statblock
name: Goblin
size: Small
type: humanoid
ac: 15
hp: 7
speed: 30 ft.
stats: [8, 15, 10, 10, 8, 8]
```

---

#### Initiative Tracker *(by javalent)*
Full combat tracker in the sidebar — add creatures, roll initiative, track HP and conditions.
- [x] Install & enable
- [x] Links with Fantasy Statblocks automatically (creatures from your statblocks auto-populate)
- [x] Access via the sword icon in the left ribbon

---

#### Dice Roller *(by javalent)*
Roll dice inline in your notes. Used by Initiative Tracker and Fantasy Statblocks too — install this first.
- [x] Install & enable

**Usage:** Type `` `dice: 2d6` `` anywhere in a note → renders as a clickable dice roller.
Also works for tables: `` `dice: [[NPC Table]]` `` rolls on a random table in another note.

---

#### Calendarium *(by javalent — formerly "Fantasy Calendar")*
Lets you build fully custom calendars. You can enter the Amantian calendar system (Silver/Emerald/Ruby/Gold Turns, 10-day spans, custom day names) and track in-game dates on it.
- [x] Install & enable
- [x] Open via moon icon in left ribbon
- [x] Click **+** to create a new calendar named `Amantian Calendar`

**Amantian Calendar Setup:**
> Months (Turns): Silver Turn, Emerald Turn, Ruby Turn, Gold Turn (90 days each)
> Intercalary days: New Year's Festival, Spring Festival, Summer Festival, Harvest Festival (1 day each)
> Week length: 10 days
> Week day names: Liraelyssday, Aurinvaldrsday, Tirealsday, Asterday, Noirilshasday, Aquaday, Terranday, Ignanday, Auranday, Caelysyrsday
> See [[01 - World/Calendar & Time/Amantian Calendar]] for full details

---

### 🟡 Install Second (high value, slightly lower urgency)

#### Folder Notes *(by LostPaul)*
Makes folder names clickable — the folder itself becomes a note. Perfect for your vault structure.
- [x] Install & enable
- [x] Go to **Settings → Folder Notes** → toggle ON: **Create folder notes on folder creation**
- [x] Each of your top-level folders (01 - World, 02 - People, etc.) will now be clickable

> [!tip] How to use
> Click on any folder name in the sidebar to open its note. Put a summary of what's in that folder there. Great for the Country Index, Species Index, etc.

---

#### Banners *(Pixel Banner — installed)*
Adds a banner image to the top of any note. Dramatically improves how your notes look.
- [x] Install & enable
- [x] Add `banner: "path/to/image.jpg"` to any note's frontmatter to activate
- [x] All 12 species notes have banners — images extracted from source PDF into `04 - Species/Species Images/`

**Usage example** — add to a country note's frontmatter:
```yaml
banner: "https://some-fantasy-art-url.jpg"
banner_y: 0.4
```

> [!tip] For Amantia
> Great for country notes, major NPC notes, and the Dashboard. AI-generated or free fantasy art works well.

---

#### Various Complements *(by ryota-ka)*
Auto-completes wiki links as you type — like IDE autocomplete for your notes.
- [x] Install & enable
- [x] **Settings → Various Complements** → toggle ON: **Auto complete in file** and **Match strategy: prefix**

> [!tip] How it helps
> Type `[[Tir` and it suggests all notes starting with "Tir". Huge time-saver when linking countries, NPCs, etc.

---

#### Supercharged Links *(by mdelobelle)*
Adds tiny icons and colour-coded styling to `[[links]]` based on the note's tags. At a glance, you can see if a link is an NPC, location, deity, etc.
- [x] Install & enable
- [x] Rules configured via data.json — CSS snippet `amantia-supercharged-links` enabled

| Target property | Value    | Prefix emoji |
| --------------- | -------- | ------------ |
| tags            | npc      | 🧑           |
| tags            | location | 📍           |
| tags            | deity    | 🙏           |
| tags            | country  | 🗺️          |
| tags            | session  | 📝           |
| tags            | faction  | ⚔️           |
| tags            | item     | 💎           |
| tags            | species  | 🧬           |

---

### 🟢 Install When Ready (advanced / nice-to-have)

#### Excalidraw *(by Zsolt Viczian)*
Draw freehand maps, flowcharts, and sketches directly inside Obsidian.
- [x] Install & enable
- [ ] Use for dungeon maps, encounter layouts, relationship webs

#### Custom Frames *(by Ellpeck)*
Embeds external websites (like D&D Beyond) as panels inside Obsidian.
- [x] Install & enable
- [ ] Go to **Settings → Custom Frames** → add a frame for D&D Beyond

#### Second Window / Image Window *(installed)*
Opens a second Obsidian window — great for showing players images on a second screen while you keep your notes private.
- [x] Install & enable when you have a second screen

#### Dataview *(by Michael Brenan)*
Query your vault like a database. List all NPCs in a location, show sessions by date, etc. This is the **Really Advanced** step from the guide — come back to it once everything else is set up.
- [x] Install & enable *(but configure later)*

---

## Part 4 — After Setup Checklist

Once plugins are installed, do these quick wins:

- [ ] Open the Dashboard `[[🏠 Amantia DM Dashboard]]` and confirm all links work
- [ ] Create a new note using a template (test the NPC Template)
- [x] Set up the Amantian Calendar in Calendarium
- [x] Enable Supercharged Links tag rules
- [ ] Star the `00 - Dashboard` folder in the sidebar (right-click → Star)

---

> [!success] You're done with Step 3
> Next up: **P1 — Folder Notes** (already installed above), then **P2 — Banners** (add images to key notes), then **P4 — Maps**.
