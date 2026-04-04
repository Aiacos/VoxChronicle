/**
 * Adventure content fixtures for RAG suggestion and summary testing.
 *
 * Contains curated adventure excerpts and transcript scenarios for testing
 * that the AI pipeline produces contextually coherent suggestions.
 * Includes scene descriptions, NPC data, and expected thematic keywords
 * that valid suggestions MUST reference.
 *
 * Sources: D&D 5e SRD, classic adventure tropes, and user-provided excerpts.
 */

// ---------------------------------------------------------------------------
// Scene 1: Village of Barovia — dark gothic horror village entry
// ---------------------------------------------------------------------------

export const BAROVIA_VILLAGE = {
  id: 'barovia-village',
  title: 'Village of Barovia',

  // Full adventure context (what would be in RAG or journal)
  adventureContext: `Chapter 3: Village of Barovia

The Village of Barovia is a gloomy settlement nestled in the shadow of Castle Ravenloft. The village is eerily quiet, with most of its inhabitants hiding behind locked doors.

AREA E1 — VILLAGE ENTRANCE
The gravel road leads to a village, its tall houses dark as tombstones. Nestled among these solemn dwellings are a handful of closed-up shops. Even the tavern is shut tight.

A soft whimpering draws your eye toward a pair of children standing in the middle of an otherwise lifeless street. The boy, about ten, and his sister, perhaps seven, clutch each other in fear. The boy says, "There's a monster in our house!"

The children are Rose and Thorn Durst, the offspring of Gustav and Elisabeth Durst. They claim a monster is lurking in the basement of their home. In truth, they are illusory projections created by the house itself to lure adventurers inside.

AREA E2 — BLOOD OF THE VINE TAVERN
Despite its closed appearance, the Blood of the Vine tavern actually does serve patrons — the door is merely stuck, not locked. Inside, the tavern is dimly lit by oil lamps. Three Vistani women named Alenka, Mirabel, and Sorvia tend bar. A lone figure sits in the corner: Ismark Kolyanovich, the burgomaster's son, who is drinking himself into a stupor.

Ismark asks the party to help escort his sister Ireena Kolyana to the town of Vallaki, where she might be safe from Strahd's predations. Strahd has visited their home twice already, biting Ireena each time. Their father, the burgomaster, died of a heart attack three days ago, and Ismark needs help burying him at the church.

AREA E3 — MAD MARY'S TOWNHOUSE
A sobbing woman can be heard from inside this boarded-up townhouse. This is Mad Mary, whose daughter Gertruda left home a week ago to explore Castle Ravenloft. Mary is inconsolable and barely coherent.

AREA E4 — BURGOMASTER'S MANSION
A mansion of faded grandeur stands at the edge of the village. Claw marks scratch the walls and door frames. Ismark and Ireena live here. The body of their father, Kolyan Indirovich, lies in a side room, awaiting proper burial.

Ireena is a striking young woman with auburn hair. She is brave, resolute, but terrified of Strahd. She bears two bite marks on her neck. She will agree to accompany the party to Vallaki if they first help bury her father at the church.

AREA E5 — CHURCH OF THE MORNINGLORD
The church stands at the far end of the village, its steeple cracked and leaning. Father Donavich, the village priest, is inside, praying desperately. His son, Doru, was turned into a vampire spawn during a recent uprising against Strahd. Doru is now locked in the undercroft beneath the church, screaming for blood.

KEY NPCs:
- Rose and Thorn Durst: Ghost children, illusory lures for Death House
- Ismark Kolyanovich: Burgomaster's son, wants to protect Ireena
- Ireena Kolyana: Target of Strahd's obsession, bears bite marks
- Mad Mary: Distraught mother, daughter went to Castle Ravenloft
- Father Donavich: Tormented priest, son is a vampire spawn
- Doru: Vampire spawn locked beneath the church`,

  // Test scenarios: transcript → expected suggestion themes
  scenarios: [
    {
      id: 'village-entry',
      transcript:
        'The gravel road leads to a village, its tall houses dark as tombstones. Nestled among these solemn dwellings are a handful of closed-up shops. Even the tavern is shut tight. A soft whimpering draws your eye toward a pair of children standing in the middle of an otherwise lifeless street.',
      description: 'Party arrives at village, sees the children',
      expectedThemes: [
        'children',
        'Rose',
        'Thorn',
        'monster',
        'house',
        'Durst'
      ],
      expectedTypes: ['narration', 'dialogue'],
      minimumConfidence: 0.5
    },
    {
      id: 'tavern-entry',
      transcript:
        'The party pushes open the stuck door of the tavern and steps inside. The dim interior smells of stale ale and desperation. A few figures are visible in the low lamplight.',
      description: 'Party enters the Blood of the Vine tavern',
      expectedThemes: [
        'Ismark',
        'Vistani',
        'tavern',
        'Alenka',
        'Mirabel',
        'Sorvia'
      ],
      expectedTypes: ['narration', 'dialogue', 'action'],
      minimumConfidence: 0.5
    },
    {
      id: 'ismark-plea',
      transcript:
        'DM: The man in the corner looks up at you with bloodshot eyes. "You are not from around here." He takes a swig from his flask. Player 1: I sit down across from him. "We just arrived. What happened to this place?" Player 2: I keep watch on the door while they talk.',
      description: 'Party meets Ismark and begins dialogue',
      expectedThemes: [
        'Ireena',
        'Strahd',
        'escort',
        'Vallaki',
        'burgomaster',
        'burial'
      ],
      expectedTypes: ['dialogue', 'narration'],
      minimumConfidence: 0.5
    },
    {
      id: 'church-discovery',
      transcript:
        'The party walks toward the crumbling church at the edge of the village. A desperate prayer echoes from within. As they approach, they hear something else — a muffled screaming from below the church.',
      description: 'Party approaches the church with Doru screaming',
      expectedThemes: [
        'Donavich',
        'Doru',
        'vampire',
        'undercroft',
        'priest'
      ],
      expectedTypes: ['narration', 'action'],
      minimumConfidence: 0.5
    }
  ]
};

// ---------------------------------------------------------------------------
// Scene 2: Goblin Ambush — classic combat encounter from SRD-style adventure
// ---------------------------------------------------------------------------

export const GOBLIN_AMBUSH = {
  id: 'goblin-ambush',
  title: 'Goblin Ambush on Triboar Trail',

  adventureContext: `Chapter 1: Goblin Arrows

The adventure begins as the characters escort a wagon of mining supplies from the city of Neverwinter along the High Road and then east along the Triboar Trail. Their patron, a dwarf named Gundren Rockseeker, has gone ahead with a human warrior named Sildar Hallwinter to attend to business at the frontier town of Phandalin.

AMBUSH SITE
About half a day's travel along the Triboar Trail, the party comes upon a gruesome scene: two dead horses blocking the path. Black-feathered arrows protrude from the carcasses. The saddlebags have been looted, and an empty leather map case lies nearby.

These are Gundren's and Sildar's horses. The goblins that killed them belong to the Cragmaw tribe. Four goblins hide in the woods on both sides of the road — two on each side — waiting to ambush the party.

GOBLIN TACTICS
The goblins are cunning but cowardly. If two or more goblins are killed, the remaining goblins attempt to flee northeast along a hidden trail to Cragmaw Hideout. A character who succeeds on a DC 10 Wisdom (Survival) check spots the trail. The trail shows signs of about twelve goblins plus the drag marks of two human-sized bodies.

CRAGMAW HIDEOUT
Following the goblin trail 5 miles northeast leads to a cave hidden behind a thicket. The cave serves as the hideout of the Cragmaw goblins. Inside, the party can find Sildar Hallwinter, bound and beaten in the lair of Yeemik, the goblin second-in-command.

Klarg, a bugbear, leads this group of goblins from a large cave at the back of the hideout. He has Gundren's supplies and map. Klarg will fight to the death unless offered significant treasure.

KEY NPCs:
- Gundren Rockseeker: Dwarf patron, captured by goblins, taken to Cragmaw Castle
- Sildar Hallwinter: Human warrior, captured, held at Cragmaw Hideout
- Klarg: Bugbear leader of the Cragmaw Hideout
- Yeemik: Goblin second-in-command, willing to betray Klarg`,

  scenarios: [
    {
      id: 'dead-horses',
      transcript:
        'As you round the bend in the trail, you see two dead horses sprawled across the path, riddled with black-feathered arrows. The saddlebags have been looted and an empty map case lies nearby.',
      description: 'Party discovers the ambush site',
      expectedThemes: [
        'goblin',
        'ambush',
        'arrows',
        'Gundren',
        'Sildar',
        'trail'
      ],
      expectedTypes: ['action', 'narration'],
      minimumConfidence: 0.5
    },
    {
      id: 'after-combat',
      transcript:
        'Player 1: I search the dead goblins for any clues. Player 2: I want to look around the area for tracks. DM: Roll Survival. Player 2: That is a 14. DM: You spot a trail leading northeast through the underbrush, with many small footprints and what looks like drag marks.',
      description: 'After defeating goblins, tracking to hideout',
      expectedThemes: [
        'trail',
        'Cragmaw',
        'hideout',
        'follow',
        'Sildar',
        'cave'
      ],
      expectedTypes: ['narration', 'action'],
      minimumConfidence: 0.5
    }
  ]
};

// ---------------------------------------------------------------------------
// Scene 3: Dragon Hoard — classic exploration encounter
// ---------------------------------------------------------------------------

export const DRAGON_HOARD = {
  id: 'dragon-hoard',
  title: 'The Dragon\'s Lair Beneath Thundertree',

  adventureContext: `Chapter 3: The Spider's Web — Thundertree

The village of Thundertree was destroyed years ago by the eruption of Mount Hotenow. Its crumbling buildings are now covered in ash and overgrown with vegetation. A young green dragon named Venomfang has recently claimed the old tower as its lair.

VENOMFANG'S TOWER
The old stone tower stands at the center of the ruined village. Thick green vines crawl up its sides. The interior reeks of chlorine — the unmistakable stench of a green dragon's breath.

Venomfang is a young green dragon — cunning, manipulative, and arrogant. He has gathered a modest hoard in the tower's upper level. He will parley with adventurers if he senses they are strong, attempting to redirect them against his rivals — the cultists encamped nearby, or the ash zombies wandering the ruins.

If combat ensues, Venomfang uses his breath weapon on the first round, then takes flight if reduced to half hit points. He is too proud to die in what he considers a minor territorial dispute.

TREASURE HOARD
Venomfang's hoard includes: 800 gp, 150 sp, four silver goblets set with moonstones (60 gp each), a scroll of misty step, and a +1 battleaxe called Hew, which was forged by dwarves to cut through wood.

REIDOTH THE DRUID
An elderly druid named Reidoth inhabits a cottage on the outskirts. He knows the dragon's habits and can warn the party about its breath weapon. He will help if the party agrees to drive out the dragon. Reidoth also knows the location of Cragmaw Castle and Wave Echo Cave.

KEY NPCs:
- Venomfang: Young green dragon, cunning and arrogant
- Reidoth: Druid ally, knows dragon's habits and regional geography`,

  scenarios: [
    {
      id: 'approaching-tower',
      transcript:
        'DM: As you approach the old tower, a pungent chemical smell hits your nostrils. The stone walls are covered in thick green vines, and you can see something large moving behind the broken windows on the upper floor. Player 1: Is that... a dragon? Player 2: I want to sneak closer to get a better look.',
      description: 'Party approaches Venomfang\'s tower',
      expectedThemes: [
        'Venomfang',
        'dragon',
        'green',
        'breath',
        'cunning',
        'tower'
      ],
      expectedTypes: ['action', 'narration', 'reference'],
      minimumConfidence: 0.5
    },
    {
      id: 'dragon-parley',
      transcript:
        'The dragon tilts its massive head and regards you with slitted eyes. A low rumble that might be laughter echoes through the tower. "Brave little creatures. I could use pawns such as you." It flicks its tail toward the south. "There are cultists in the ruins who annoy me greatly."',
      description: 'Venomfang attempts to manipulate the party',
      expectedThemes: [
        'cultists',
        'manipulate',
        'redirect',
        'Venomfang',
        'parley',
        'rival'
      ],
      expectedTypes: ['dialogue', 'action', 'narration'],
      minimumConfidence: 0.5
    }
  ]
};

// ---------------------------------------------------------------------------
// Scene 4: Social intrigue — noble court encounter
// ---------------------------------------------------------------------------

export const NOBLE_COURT = {
  id: 'noble-court',
  title: 'The Baron\'s Feast at Vallaki',

  adventureContext: `Chapter 5: The Town of Vallaki

Vallaki is a walled town ruled by the delusional Baron Vargas Vallakovich, who believes that weekly festivals of forced happiness can ward off Strahd's influence. His motto is "All Will Be Well!" and he punishes anyone who displays unhappiness.

THE BARON'S MANSION
The Baron hosts a mandatory feast for prominent citizens. Guards in blue-and-gold livery patrol the grounds. The Baron's wife, Lydia Petrovna, nervously manages the servants. Their son, Victor, is a reclusive teenager obsessed with magic — he has been practicing teleportation circles in the attic, accidentally killing two of the household servants.

Lady Fiona Wachter opposes the Baron secretly and leads a devil-worshipping cult called the "book club." She believes that submitting to Strahd is the only path to survival and plots to overthrow the Baron. If the party seems sympathetic, she will ask for their help.

Izek Strazni is the Baron's right-hand man and enforcer, a hulking brute with a demonic arm that can generate fire. He is obsessed with finding a woman who looks like Ireena Kolyana — he has been commissioning dolls in her likeness from the toymaker Blinsky.

THE FESTIVAL OF THE BLAZING SUN
The next scheduled festival involves lighting a giant wicker sun. If it goes wrong (and it always does), the Baron orders the arrest of anyone who "maliciously unhappy."

KEY NPCs:
- Baron Vargas Vallakovich: Delusional ruler, forces happiness
- Lydia Petrovna: Baron's nervous wife
- Victor Vallakovich: Reclusive teenage son, dabbling in dangerous magic
- Lady Fiona Wachter: Secret opposition leader, devil-worshipper
- Izek Strazni: Baron's enforcer, has a demonic arm, obsessed with Ireena
- Blinsky: Toymaker, makes creepy dolls`,

  scenarios: [
    {
      id: 'feast-arrival',
      transcript:
        'DM: You are escorted into the Baron\'s dining hall. Forced smiles adorn every face. The Baron rises and declares, "Welcome, friends! All will be well!" His wife Lydia almost drops a serving tray. Player 1: I smile back nervously. Player 2: I look around for anyone who seems genuine.',
      description: 'Party attends the Baron\'s mandatory feast',
      expectedThemes: [
        'Baron',
        'Vallakovich',
        'happiness',
        'Fiona',
        'Izek',
        'festival'
      ],
      expectedTypes: ['dialogue', 'narration', 'action'],
      minimumConfidence: 0.5
    }
  ]
};

// ---------------------------------------------------------------------------
// Scene 5: Dungeon exploration — trap and puzzle focused
// ---------------------------------------------------------------------------

export const WAVE_ECHO_CAVE = {
  id: 'wave-echo-cave',
  title: 'Wave Echo Cave',

  adventureContext: `Chapter 4: Wave Echo Cave

The legendary Wave Echo Cave was once home to the Phandelver's Pact — an alliance between dwarves and gnomes who mined rich veins of ore and channeled powerful magic through the Forge of Spells. The cave was lost when orcs invaded and triggered a catastrophic magical battle.

CAVE ENTRANCE
The entrance is a natural cave mouth partially collapsed. A cold breeze carries the faint sound of rhythmic booming — the "wave echo" that gives the cave its name. It is the sound of waves crashing against underground shores deep within the cave system.

ROOM 1 — GUARD ROOM
Just inside the entrance is a large chamber serving as a guard room. The skeletal remains of several dwarves and orcs lie scattered, testament to the ancient battle. A passage leads deeper into the cave.

ROOM 4 — FUNGUS CAVERN
An enormous cavern is filled with strange fungi of many sizes and colors. Some emit a faint phosphorescent glow. Among them, two dangerous ochre jellies lurk, attracted by the warmth of living creatures.

ROOM 14 — THE FORGE OF SPELLS
The legendary Forge is a great stone brazier surrounded by runic channels. A spectral green flame burns within — the last remnant of the magical power that once suffused the mine. Any nonmagical weapon or armor left in the forge for 1 minute takes on a +1 enchantment that lasts for 1d12 hours.

The Black Spider — a drow named Nezznar — has set up his base in the temple near the Forge. He seeks to control the Forge's power for himself. He is guarded by four giant spiders and two bugbear bodyguards.

KEY NPCs:
- Nezznar (The Black Spider): Drow villain, seeks to control the Forge of Spells
- Mormesk: Wraith guarding the old wizards' quarters, can be negotiated with`,

  scenarios: [
    {
      id: 'cave-entrance',
      transcript:
        'DM: The cave mouth yawns before you, cold air rushing out. You hear a rhythmic booming echo from deep within — like distant waves crashing on stone. Bones and rusted weapons litter the entrance. Player 1: I light a torch and look inside. Player 2: I check for tracks. DM: Roll Investigation.',
      description: 'Party enters Wave Echo Cave',
      expectedThemes: [
        'dwarves',
        'orcs',
        'ancient',
        'battle',
        'Forge',
        'deeper'
      ],
      expectedTypes: ['narration', 'action'],
      minimumConfidence: 0.5
    }
  ]
};

// ---------------------------------------------------------------------------
// Scene 6: Death House interior — dungeon crawl, traps, horror
// ---------------------------------------------------------------------------

export const DEATH_HOUSE = {
  id: 'death-house',
  title: 'Death House — Curse of Strahd',

  adventureContext: `Death House — Curse of Strahd (Appendix B)

Death House is a haunted townhouse in the village of Barovia, designed to level characters from 1 to 3. It contains 38 locations across four floors and a dungeon level.

FLOOR 1 — MAIN HALL
The main hall has a wide staircase leading up, a cloakroom, and a den of wolves (two stuffed wolves flank the entrance). Dusty coats and cloaks hang in the cloakroom. The den contains two locked cabinets — one holds a heavy crossbow, a light crossbow, and 20 bolts; the other a deck of cards and wine glasses.

FLOOR 2 — UPPER HALL
A portrait of the Durst family hangs here: Gustav and Elisabeth Durst with their two children, Rose and Thorn. Elisabeth holds a third baby — a bastard child fathered by Gustav with the nursemaid. Mrs. Durst looks at the baby with scorn. The portrait reveals the family's dark secret.

FLOOR 3 — ATTIC
Area 20 is the children's room. It contains the skeletal remains of Rose and Thorn Durst, who starved to death after their parents locked them in their room. Their ghosts appear here — they are not inherently hostile but may possess PCs out of fear of abandonment. Rose (age 10) tries to protect Thorn (age 7).

DUNGEON — RITUAL CHAMBERS
Area 34 contains Gustav and Elisabeth Durst, now undead ghasts, guarding the path to the ritual chamber.
Area 38 is the ritual chamber with a bloodstained altar. Illusory figments of hooded cultists chant "One must die!" demanding a living sacrifice. If the party refuses to sacrifice, Lorghoth the Decayer — a Shambling Mound — emerges from the altar pit to attack.

ENCOUNTERS:
- Animated armor (Area 11, suit of plate)
- Nursemaid's specter (Areas 15-18, the ghost of the murdered nursemaid)
- Five shadows (Area 31, remnants of cult sacrifices)
- Gustav and Elisabeth Durst as ghasts (Area 34)
- Lorghoth the Decayer, Shambling Mound (Area 38)

KEY NPCs:
- Rose Durst: Ghost child (age 10), protective of Thorn
- Thorn Durst: Ghost child (age 7), frightened
- Gustav Durst: Cult leader, now a ghast
- Elisabeth Durst: Cultist wife, now a ghast
- Lorghoth the Decayer: Shambling Mound, the "monster in the basement"`,

  scenarios: [
    {
      id: 'death-house-portrait',
      transcript:
        'The party examines the large portrait on the upper hall wall. It depicts a noble family — a stern man, an elegant but cold woman, two young children, and a baby held awkwardly. Player 1: Something is off about this painting. The woman seems angry at the baby.',
      description: 'Party discovers the Durst family portrait and its dark secret',
      expectedThemes: ['Gustav', 'Elisabeth', 'nursemaid', 'baby', 'bastard', 'secret', 'Durst'],
      expectedTypes: ['narration', 'reference'],
      minimumConfidence: 0.5
    },
    {
      id: 'death-house-children-ghosts',
      transcript:
        'In the attic room, the party finds two small skeletons huddled together in the corner. A cold chill fills the room and two spectral children appear — a boy and a younger girl. The girl hides behind the boy. Player 1: Are you Rose and Thorn? Player 2: I kneel down to their eye level.',
      description: 'Party encounters the ghost children in the attic',
      expectedThemes: ['Rose', 'Thorn', 'starved', 'locked', 'possess', 'parents', 'basement', 'monster'],
      expectedTypes: ['dialogue', 'narration'],
      minimumConfidence: 0.5
    },
    {
      id: 'death-house-ritual',
      transcript:
        'DM: You descend into the ritual chamber. A bloodstained stone altar stands at the center. Suddenly, ghostly figures in dark robes appear around you, chanting in unison: "One must die! One must die!" Player 1: We are NOT sacrificing anyone. Player 2: I draw my sword. Player 3: Is there another way out?',
      description: 'Party faces the ritual chamber sacrifice demand',
      expectedThemes: ['Lorghoth', 'shambling', 'mound', 'sacrifice', 'altar', 'refuse', 'attack', 'emerge'],
      expectedTypes: ['narration', 'action'],
      minimumConfidence: 0.5
    }
  ]
};

// ---------------------------------------------------------------------------
// Scene 7: Greenest in Flames — Hoard of the Dragon Queen, raid scenario
// ---------------------------------------------------------------------------

export const GREENEST_FLAMES = {
  id: 'greenest-flames',
  title: 'Greenest in Flames — Hoard of the Dragon Queen',

  adventureContext: `Episode 1: Greenest in Flames — Hoard of the Dragon Queen

The town of Greenest is under attack by the Cult of the Dragon. As the party approaches, they see the town ablaze, with flickering torches in the streets and townsfolk fleeing toward the keep. An adult blue dragon named Lennithon circles above, diving at buildings and unleashing lightning breath.

The Cult of the Dragon raids Greenest to gather treasure for the return of Tiamat. The attack occurs through a long night with no opportunity for full rest.

MISSION 1 — SEEK THE KEEP
The party encounters Linan Swift and her family being attacked by kobolds on the road to the keep. Eight kobolds surround the family. After the rescue, the party reaches the keep where Governor Nighthill coordinates the defense from the parapet. Castellan Escobert the Red, a shield dwarf, manages the keep's internal defenses.

MISSION 2 — THE OLD TUNNEL
An old tunnel beneath the keep leads outside the walls. Castellan Escobert gives the party the key. The tunnel is infested with two rat swarms. A locked gate at the far end opens near the stream.

MISSION 3 — SANCTUARY
Townsfolk have taken refuge in the temple of Chauntea. Cultists and kobolds attempt to batter down the doors and set fires. The party must rescue 50+ civilians trapped inside.

MISSION 4 — SAVE THE MILL
The mill appears to be under attack, but it is actually an ambush by cultists waiting for would-be rescuers. The party spots cultists hiding inside if they approach cautiously.

MISSION 5 — DRAGON ATTACK
Lennithon the adult blue dragon attacks the keep. The dragon is not fully committed to the attack — it serves as a mercenary for the cult and can be driven off if it takes significant damage (reduced to half HP). Negotiation is possible: Lennithon dislikes being used as a pawn.

MISSION 6 — HALF-DRAGON CHAMPION
At dawn, Langdedrosa Cyanwrath, a half-blue-dragon champion, challenges the party to single combat. He holds prisoners hostage to force the duel. Cyanwrath fights with honor but is a deadly foe for low-level characters. His commander Frulam Mondath watches from the cult's ranks.

KEY NPCs:
- Governor Nighthill: Leader of Greenest, coordinates defense from the keep
- Castellan Escobert the Red: Shield dwarf, manages keep's defenses
- Linan Swift: Civilian mother the party can rescue
- Lennithon: Adult blue dragon, mercenary for the cult, can be negotiated with
- Langdedrosa Cyanwrath: Half-blue-dragon champion, demands single combat
- Frulam Mondath: Cult leader commanding the raid`,

  scenarios: [
    {
      id: 'greenest-approach',
      transcript:
        'DM: As you crest the hill, you see the town of Greenest spread below you. Columns of black smoke rise from burning buildings. In the streets, you can see people running and screaming. And circling above it all, a massive blue dragon unleashes a bolt of lightning that tears through a barracks. Player 1: Dear gods. Player 2: We have to help them. Player 3: That is a DRAGON.',
      description: 'Party first sees Greenest under attack',
      expectedThemes: ['Lennithon', 'dragon', 'cult', 'keep', 'Nighthill', 'rescue', 'kobold', 'Tiamat'],
      expectedTypes: ['action', 'narration'],
      minimumConfidence: 0.5
    },
    {
      id: 'greenest-cyanwrath-duel',
      transcript:
        'DM: At dawn, the cultists part ranks. A towering half-dragon steps forward, blue scales glinting. He holds a group of bound prisoners. "Send your strongest to face me in single combat," he bellows, "or these prisoners die." Player 1: I will face him. Player 2: Wait, he looks incredibly powerful. Player 3: We do not have a choice, he has hostages.',
      description: 'Langdedrosa Cyanwrath challenges the party',
      expectedThemes: ['Cyanwrath', 'duel', 'champion', 'prisoners', 'hostage', 'honor', 'Mondath', 'half-dragon'],
      expectedTypes: ['dialogue', 'action', 'narration'],
      minimumConfidence: 0.5
    }
  ]
};

// ---------------------------------------------------------------------------
// Scene 8: Nightstone — Storm King's Thunder, abandoned village
// ---------------------------------------------------------------------------

export const NIGHTSTONE = {
  id: 'nightstone',
  title: 'Nightstone — Storm King\'s Thunder',

  adventureContext: `Chapter 1: A Great Upheaval — Storm King's Thunder

The village of Nightstone sits in the hills south of the Ardeep Forest. The party arrives to find the village devastated — massive boulders (15 feet in diameter, 500 pounds each) litter the streets, punched through rooftops, and crushed buildings. The cloud giants attacked from above, bombarding the village to steal the obsidian Nightstone megalith — a mysterious artifact with ancient glyphs that radiated magic.

THE VILLAGE
The village is surrounded by a wooden palisade with a drawbridge over a moat. The drawbridge is lowered when the party arrives. The village bell in the temple normally warns of danger, but it now rings erratically — two goblins are ringing it for fun.

Goblins from the Dripping Caves have invaded the abandoned village to loot what the giants left behind. They appear in ones and twos throughout the village, rummaging through destroyed buildings.

KEY LOCATIONS:
- Nightstone Inn: Owned by Morak Ur'gray, a shield dwarf. Contains supplies and a hidden cache of coins.
- Temple of Lathander: Contains the village bell. Two goblins ring it. Dead bodies of villagers inside.
- Trading Post: Partially collapsed. Contains trade goods.
- Windmill: Destroyed by a boulder.
- Village Square: Where the obsidian Nightstone megalith once stood — now a gaping crater.

DRIPPING CAVES
The villagers fled to the Dripping Caves, 2 miles north. The goblin boss Hark has captured them. The caves contain goblin warriors, an ogre named Nob, and imprisoned villagers including Morak.

Kella Darkhope, a Zhentarim spy, lurks at the inn pretending to be a survivor. She sent word to the Zhentarim about the village's vulnerability.

KEY NPCs:
- Morak Ur'gray: Dwarf innkeeper, captured by goblins in Dripping Caves
- Kella Darkhope: Zhentarim spy, pretends to be a survivor at the inn
- Hark: Goblin boss holding villagers captive
- Nob: Ogre in the Dripping Caves`,

  scenarios: [
    {
      id: 'nightstone-arrival',
      transcript:
        'DM: You approach the village of Nightstone. The drawbridge is down and the moat is still. As you cross, you notice something strange — massive boulders, fifteen feet across, are embedded in the ground and through rooftops. The village bell rings in an odd, unrhythmic pattern. No townspeople are visible. Player 1: I look for signs of life. Player 2: What could drop boulders that large?',
      description: 'Party arrives at devastated Nightstone',
      expectedThemes: ['giant', 'cloud', 'goblin', 'bell', 'boulder', 'megalith', 'Nightstone', 'abandoned'],
      expectedTypes: ['narration', 'action'],
      minimumConfidence: 0.5
    },
    {
      id: 'nightstone-kella',
      transcript:
        'The party enters the Nightstone Inn. Inside, a young woman sits at a table, looking shaken. She claims to have survived the attack by hiding in the cellar. Player 1: What happened here? Who attacked? Player 2: I check if she has any injuries. Something feels off about her story.',
      description: 'Party meets Kella Darkhope, the Zhentarim spy',
      expectedThemes: ['Kella', 'spy', 'Zhentarim', 'lying', 'Morak', 'caves', 'villagers', 'captured', 'cellar', 'hiding', 'deception', 'insight', 'suspicious', 'attack', 'giant', 'boulder', 'survived', 'trust', 'alone', 'inn'],
      expectedTypes: ['dialogue', 'action'],
      minimumConfidence: 0.5
    }
  ]
};

// ---------------------------------------------------------------------------
// Helpers: collect all fixtures for iteration
// ---------------------------------------------------------------------------

export const ALL_ADVENTURES = [
  BAROVIA_VILLAGE,
  GOBLIN_AMBUSH,
  DRAGON_HOARD,
  NOBLE_COURT,
  WAVE_ECHO_CAVE,
  DEATH_HOUSE,
  GREENEST_FLAMES,
  NIGHTSTONE
];

/**
 * Returns all test scenarios across all adventures, flattened.
 * Each entry includes the parent adventure's context.
 * @returns {Array<{adventureId, adventureTitle, adventureContext, scenario}>}
 */
export function getAllScenarios() {
  const result = [];
  for (const adv of ALL_ADVENTURES) {
    for (const scenario of adv.scenarios) {
      result.push({
        adventureId: adv.id,
        adventureTitle: adv.title,
        adventureContext: adv.adventureContext,
        scenario
      });
    }
  }
  return result;
}
