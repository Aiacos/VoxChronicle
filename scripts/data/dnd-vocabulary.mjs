/**
 * Pre-loaded D&D 5E vocabulary for improved transcription accuracy.
 * Includes common spells, creatures, classes, conditions, and abilities
 * that might be misheard by general-purpose transcription services.
 */

/**
 * Common D&D terms organized by category
 * @type {{[key: string]: string[]}}
 */
export const DND_VOCABULARY = {
  /**
   * Common spell names from D&D 5E
   */
  spells: [
    // Cantrips
    'Eldritch Blast',
    'Fire Bolt',
    'Sacred Flame',
    'Vicious Mockery',
    'Toll the Dead',
    'Mind Sliver',
    'Ray of Frost',
    'Shocking Grasp',
    'Chill Touch',
    'Mage Hand',
    'Prestidigitation',
    'Thaumaturgy',
    'Druidcraft',

    // 1st Level
    'Magic Missile',
    'Healing Word',
    'Cure Wounds',
    'Shield',
    'Mage Armor',
    'Thunderwave',
    'Burning Hands',
    'Bless',
    'Bane',
    'Guiding Bolt',
    'Detect Magic',
    'Identify',
    'Chromatic Orb',
    'Sleep',
    'Faerie Fire',
    "Hunter's Mark",
    'Hex',

    // 2nd Level
    'Misty Step',
    'Spiritual Weapon',
    'Heat Metal',
    'Scorching Ray',
    'Shatter',
    'Hold Person',
    'Suggestion',
    'Invisibility',
    'Mirror Image',
    'Blur',
    'Pass Without Trace',
    'Spike Growth',

    // 3rd Level
    'Fireball',
    'Lightning Bolt',
    'Counterspell',
    'Dispel Magic',
    'Hypnotic Pattern',
    'Haste',
    'Fly',
    'Spirit Guardians',
    'Conjure Animals',
    'Revivify',
    'Sending',
    'Tongues',

    // 4th Level
    'Polymorph',
    'Banishment',
    'Greater Invisibility',
    'Dimension Door',
    'Wall of Fire',
    'Ice Storm',
    'Blight',
    'Confusion',
    'Death Ward',

    // 5th Level
    'Cone of Cold',
    'Cloudkill',
    'Animate Objects',
    'Mass Cure Wounds',
    'Scrying',
    'Teleportation Circle',
    'Wall of Force',
    "Bigby's Hand",
    'Hold Monster',

    // 6th Level
    'Disintegrate',
    'Chain Lightning',
    'Globe of Invulnerability',
    'True Seeing',
    'Heal',
    "Heroes' Feast",
    'Sunbeam',

    // 7th Level
    'Finger of Death',
    'Power Word Pain',
    'Prismatic Spray',
    'Etherealness',
    'Plane Shift',
    'Resurrection',

    // 8th Level
    'Power Word Stun',
    'Dominate Monster',
    'Earthquake',
    'Holy Aura',

    // 9th Level
    'Wish',
    'Power Word Kill',
    'Meteor Swarm',
    'Time Stop',
    'True Polymorph',
    'Gate'
  ],

  /**
   * Common creatures and monsters from D&D 5E
   */
  creatures: [
    // Iconic Monsters
    'Beholder',
    'Mind Flayer',
    'Illithid',
    'Aboleth',
    'Tarrasque',
    'Dragon',
    'Lich',

    // Dragons
    'Ancient Red Dragon',
    'Adult Black Dragon',
    'Young Bronze Dragon',
    'Wyrmling',
    'Dracolich',

    // Fiends
    'Balor',
    'Pit Fiend',
    'Marilith',
    'Succubus',
    'Incubus',
    'Cambion',
    'Erinyes',
    'Barbed Devil',
    'Bearded Devil',
    'Imp',
    'Quasit',

    // Undead
    'Vampire',
    'Vampire Spawn',
    'Zombie',
    'Skeleton',
    'Ghoul',
    'Wight',
    'Wraith',
    'Specter',
    'Banshee',
    'Death Knight',
    'Mummy',
    'Mummy Lord',

    // Aberrations (Beholder and Aboleth listed under Iconic Monsters)
    'Chuul',
    'Gibbering Mouther',
    'Intellect Devourer',
    'Nothic',

    // Giants
    'Storm Giant',
    'Cloud Giant',
    'Fire Giant',
    'Frost Giant',
    'Stone Giant',
    'Hill Giant',
    'Ettin',

    // Humanoids
    'Goblin',
    'Hobgoblin',
    'Bugbear',
    'Kobold',
    'Orc',
    'Ogre',
    'Troll',
    'Gnoll',
    'Drow',
    'Duergar',
    'Githyanki',
    'Githzerai',
    'Yuan-ti',
    'Kenku',
    'Tabaxi',
    'Aarakocra',
    'Triton',
    'Goliath',

    // Elementals
    'Fire Elemental',
    'Water Elemental',
    'Air Elemental',
    'Earth Elemental',
    'Salamander',
    'Djinni',
    'Efreeti',

    // Beasts & Monstrosities
    'Owlbear',
    'Displacer Beast',
    'Rust Monster',
    'Bulette',
    'Ankheg',
    'Basilisk',
    'Cockatrice',
    'Griffon',
    'Hippogriff',
    'Manticore',
    'Chimera',
    'Hydra',
    'Wyvern',

    // Constructs
    'Golem',
    'Iron Golem',
    'Stone Golem',
    'Clay Golem',
    'Flesh Golem',
    'Animated Armor',
    'Helmed Horror',

    // Plants
    'Shambling Mound',
    'Treant',
    'Awakened Tree',
    'Vine Blight'
  ],

  /**
   * Character classes from D&D 5E
   */
  classes: [
    // Base Classes
    'Barbarian',
    'Bard',
    'Cleric',
    'Druid',
    'Fighter',
    'Monk',
    'Paladin',
    'Ranger',
    'Rogue',
    'Sorcerer',
    'Warlock',
    'Wizard',
    'Artificer',

    // Barbarian Subclasses
    'Path of the Berserker',
    'Path of the Totem Warrior',
    'Path of the Ancestral Guardian',
    'Path of the Zealot',
    'Path of Wild Magic',

    // Bard Subclasses
    'College of Lore',
    'College of Valor',
    'College of Glamour',
    'College of Swords',
    'College of Whispers',
    'College of Eloquence',

    // Cleric Domains
    'Life Domain',
    'Light Domain',
    'Trickery Domain',
    'War Domain',
    'Tempest Domain',
    'Nature Domain',
    'Knowledge Domain',
    'Death Domain',
    'Forge Domain',
    'Grave Domain',
    'Order Domain',
    'Peace Domain',
    'Twilight Domain',

    // Druid Circles
    'Circle of the Moon',
    'Circle of the Land',
    'Circle of Dreams',
    'Circle of the Shepherd',
    'Circle of Spores',
    'Circle of Stars',
    'Circle of Wildfire',

    // Fighter Archetypes
    'Champion',
    'Battle Master',
    'Eldritch Knight',
    'Arcane Archer',
    'Cavalier',
    'Samurai',
    'Echo Knight',
    'Psi Warrior',
    'Rune Knight',

    // Monk Traditions
    'Way of the Open Hand',
    'Way of Shadow',
    'Way of the Four Elements',
    'Way of the Long Death',
    'Way of the Sun Soul',
    'Way of the Drunken Master',
    'Way of the Kensei',
    'Way of Mercy',
    'Way of the Astral Self',

    // Paladin Oaths
    'Oath of Devotion',
    'Oath of the Ancients',
    'Oath of Vengeance',
    'Oath of Conquest',
    'Oath of Redemption',
    'Oath of Glory',
    'Oath of the Watchers',
    'Oathbreaker',

    // Ranger Archetypes
    'Hunter',
    'Beast Master',
    'Gloom Stalker',
    'Horizon Walker',
    'Monster Slayer',
    'Fey Wanderer',
    'Swarmkeeper',

    // Rogue Archetypes
    'Thief',
    'Assassin',
    'Arcane Trickster',
    'Swashbuckler',
    'Mastermind',
    'Inquisitive',
    'Scout',
    'Phantom',
    'Soulknife',

    // Sorcerer Origins
    'Draconic Bloodline',
    'Wild Magic',
    'Divine Soul',
    'Shadow Magic',
    'Storm Sorcery',
    'Aberrant Mind',
    'Clockwork Soul',

    // Warlock Patrons
    'The Fiend',
    'The Archfey',
    'The Great Old One',
    'The Hexblade',
    'The Celestial',
    'The Fathomless',
    'The Genie',
    'The Undead',

    // Wizard Schools
    'School of Abjuration',
    'School of Conjuration',
    'School of Divination',
    'School of Enchantment',
    'School of Evocation',
    'School of Illusion',
    'School of Necromancy',
    'School of Transmutation',
    'Bladesinging',
    'War Magic',
    'Order of Scribes'
  ],

  /**
   * Conditions and status effects from D&D 5E
   */
  conditions: [
    'Blinded',
    'Charmed',
    'Deafened',
    'Exhaustion',
    'Frightened',
    'Grappled',
    'Incapacitated',
    'Invisible',
    'Paralyzed',
    'Petrified',
    'Poisoned',
    'Prone',
    'Restrained',
    'Stunned',
    'Unconscious',

    // Additional States
    'Concentrating',
    'Hidden',
    'Surprised',
    'Dodging',
    'Dashing',
    'Disengaging',
    'Readying',

    // Damage Types
    'Acid Damage',
    'Bludgeoning Damage',
    'Cold Damage',
    'Fire Damage',
    'Force Damage',
    'Lightning Damage',
    'Necrotic Damage',
    'Piercing Damage',
    'Poison Damage',
    'Psychic Damage',
    'Radiant Damage',
    'Slashing Damage',
    'Thunder Damage',

    // Resistances & Immunities
    'Resistance',
    'Vulnerability',
    'Immunity',
    'Advantage',
    'Disadvantage'
  ],

  /**
   * Ability scores, skills, and game mechanics
   */
  abilities: [
    // Ability Scores
    'Strength',
    'Dexterity',
    'Constitution',
    'Intelligence',
    'Wisdom',
    'Charisma',

    // Skills
    'Acrobatics',
    'Animal Handling',
    'Arcana',
    'Athletics',
    'Deception',
    'History',
    'Insight',
    'Intimidation',
    'Investigation',
    'Medicine',
    'Nature',
    'Perception',
    'Performance',
    'Persuasion',
    'Religion',
    'Sleight of Hand',
    'Stealth',
    'Survival',

    // Saving Throws
    'Strength Saving Throw',
    'Dexterity Saving Throw',
    'Constitution Saving Throw',
    'Intelligence Saving Throw',
    'Wisdom Saving Throw',
    'Charisma Saving Throw',

    // Common Actions
    'Attack Action',
    'Bonus Action',
    'Reaction',
    'Free Action',
    'Movement',
    'Opportunity Attack',
    'Attack of Opportunity',
    'Grapple',
    'Shove',

    // Combat Terms
    'Initiative',
    'Armor Class',
    'Hit Points',
    'Temporary Hit Points',
    'Spell Slot',
    'Spell Save DC',
    'Spell Attack Bonus',
    'Proficiency Bonus',
    'Critical Hit',
    'Natural Twenty',
    'Natural One',

    // Dice & Rolls
    'd4',
    'd6',
    'd8',
    'd10',
    'd12',
    'd20',
    'd100',
    'Percentile Dice',

    // Rest & Recovery
    'Short Rest',
    'Long Rest',
    'Hit Dice',
    'Death Saving Throw',

    // Inspiration & Luck
    'Inspiration',
    'Bardic Inspiration',
    'Luck Point',

    // Movement & Vision
    'Speed',
    'Flying Speed',
    'Swimming Speed',
    'Climbing Speed',
    'Darkvision',
    'Blindsight',
    'Tremorsense',
    'Truesight',

    // Magic Items & Equipment
    'Attunement',
    'Legendary Item',
    'Artifact',
    'Common Item',
    'Uncommon Item',
    'Rare Item',
    'Very Rare Item',

    // Multiclassing
    'Multiclass',
    'Multiclassing'
  ]
};
