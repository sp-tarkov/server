# Features

## Table of Contents
- [Profiles](#Profiles)
	- [Progression](#progression)
	- [Starting Profile Types](#starting-profile-types)
- [Bots](#bots)
	- [AI Types](#ai-types)
	- [Generation](#generation)
- [Inventory](#inventory)
- [Traders](#traders)
- [Flea market](#flea-market)
- [Quests](#quests)
- [Hideout](#hideout)
- [Weapon Building](#weapon-building)
- [Raids](#raids)
- [Messages](#messages)
- [Events](#events)
- [Modding](#modding)

## Profiles

### Progression

The player profile is stored as a JSON file, allowing for changes to persist across server restarts. The profile contains the following information for both your PMC and Scav player characters.

- Task Conditions
- Account Bonuses
- Model Selection
- Health
- Energy, Hydration, & Temperature
- Hideout Build & Production Status
- Items (Inventory, Insured, Quest, Wishlist)
- Inventory
- Quest Progress
- Flea Market Rating & Current Offers
- Common and Mastering Skills
- Various Raid Stats
- Trader Status and Loyalty Levels
- Extract Counts
- Achievements

### Starting Profile Types

The following profile types are available to start with when creating an account in the Launcher.

- Standard Profiles:
	- Standard
	- Left Behind
	- Prepare To Escape
	- Edge Of Darkness
- Custom profiles
	- SPT Easy Start
		- Lots of money, quality of life skills to level 20, and player to level 69.
	- SPT Zero to Hero
		- No money, skills, trader reputation, or items. Start with a knife.
	- SPT Developer
		- Developer testing profile, player to level 69, max skills, and max trader reputation.
		- USEC will have all quests ready to start.
		- BEAR will have all quests ready to hand in.

## Bots

### AI Types

Bot data is emulated to mimic live bots as closely as possible. This includes the following bot types.

- Scavs
	- Regular Scav (*assault*)
	- Sniper Scav (*marksman*)
	- Tagged & Cursed (*cursedAssault*)
- Bosses
	- Reshalla (*bossBully*)
		- Guard (*followerBully*)
	- Glukhar (*bossGluhar*) 
		- Assault Guard (*followerGluharAssault*)
		- Scout Guard (*followerGluharScout*)
		- Security Guard (*followerGluharSecurity*)
		- Sniper Guard (*followerGluharSnipe*)
	- Killa (*bossKilla*)
	- Shturman (*bossKojainy*)
		- Guard (*followerKojaniy*)
	- Sanitar (*bossSanitar*)
		- Guard (*followerSanitar*)
	- Tagilla (*bossTagilla*)
	- Knight (*bossKnight*)
	- Big Pipe (*followerBigPipe*)
	- Bird Eye (*followerBirdEye*)
	- Zryachiy (*bossZryachiy*)
		- Guard (*followerzryachiy*)
	- Kaban (*bossBoar*)
		- Sniper Guard (*bossBoarSniper*)
		- Guard (*followerBoar*)
- Cultists
	- Priest (*sectantPriest*)
	- Warrior (*sectantWarrior*)
- Raiders (*pmcBot*)
- Rogues (*exUsec*)
- Santa (*gifter*) - *partially implemented*

*PMCs are generated with a random type from a sub-set of the above list.*

*Some bot types are only available on some maps.*

### Generation

Bots are generated with the following characteristics.

- All Bots:
	- Weapons - *Weighted, semi-randomly selected*
	- Ammunition - *Weighted, semi-randomly selected*
	- Gear - *Weighted, semi-randomly selected*
	- Headgear Attachments - *Weighted, semi-randomly selected*
- PMC Bots
	- AI Type - *Randomly chosen from sub-set of possible bot types*
	- Dogtags - *Random level & name*
		- Chance of name being the name of a contributor to the project
	- Voices - *Randomly chosen Bear/USEC voices for each faction*

Other bot generation systems/features include.

- Loot item blacklist & whitelist
- Loot items can be configured to be limited to a certain number based on bot type
- Level-relative gear for PMCs from levels 1-15 and 15+
	- Level 1-15 bots have lower-tier items
	- Level 15+ bots have access to almost anything
- Randomised gear and weapon durability based on bot type and level

## Inventory

The inventory system includes the following features.

- Move, Split, and Delete Item Stacks
- Add, Modify, and Remove Item Tags
- Armor and Weapon Repair Kits
- Auto-sort Inventory
- Out-of-raid Healing, Eating, & Drinking
- Special Player Slots

## Traders

The trader system includes the following features:

- Buy and sell items from each trader
- Listed items are refreshed on a timer based on the trader
- Purchase limits per refresh period
- Tracks currency spent through each trader
- Loyalty levels
- Reputation
- Item repair from Prapor, Skier, and Mechanic
- Unlock and purchase clothing from Ragman
- Insurance from Therapist and Prapor
	- Chance for items to be returned, higher chance for more expensive trader
	- Chance parts will be stripped from returned weapons based on value
- Post-raid Therapist Healing
- Fence Item Assortment
	- Lists random items for sale
	- Emulated system of 'churn' for items sold by Fence

## Flea market

The flea market system has been build to simulate the live flea market as closely as possible. It includes the following features.

- Simulated Player Offers
	- Generated with random names, ratings, and expiry times
	- Variable offer prices based on live item prices (~20% above and below)
	- Weapon presets as offers
	- Barter offers
	- Listed in multiple currencies (Rouble, Euro, and Dollar)
	- Dynamically adjust flea prices that drift below trader price
- Buy Items
- Sell Items
	- Generates listing fee
	- Increase flea rating by selling items
	- Decrease flea rating by failing to sell items
	- Items purchased by simulated players
		- Offer price effects chance that item will be purchased
- Filtering
	- By specific item
	- By link to item
	- Text search by name
	- By currency
	- By price range
	- By condition range
	- By Traders, Players, or Both
	- To include barter offers (or not)
- Sorting by
	- Rating
	- Name
	- Price
	- Expiry

## Quests

The quest system includes the following features. 

- Accurate Quest List - *roughly 90% implemented*
- Trader Quests - *Accept, Turn-in Items, and Complete*
- Daily Quests - *Accept, Replace, Turn-in Items, Complete*
	- Simulates Daily and Weekly Quests
	- Quest Replacement Fee
- Scav Quests
- Trader items unlock through completion of quests
- Receive messages from traders after interacting with a quest
- Item rewards passed through messages

## Hideout

The hideout has the following features implemented.

- Areas
	- Air Filter
		- Filter Degradation
		- Boosts Skill Levelling
	- Bitcoin Farm
		- Generation Speed Dependent on Number of Graphics Cards
	- Booze Generator
		- Crafts Moonshine
	- Generator
		- Fuel Degradation
	- Heating
		- Energy Regeneration
		- Negative Effects Removal
	- Illumination
	- Intel Centre
		- ~~Unlocks Fence's Scav Quests~~ *not implemented - workaround: unlocks at level 5*
		- ~~Reduces Insurance Return Time~~ *not implemented*
		- Quest Currency Reward Boost
	- Lavatory
	- Library
	- Medstation
	- Nutrition Unit
	- Rest Space
	- Scav Case
		- Custom Reward System
	- Security
	- Shooting Range
	- Solar Power
	- Stash
		- Upgrades grant larger stash sizes
	- Vents
	- Water Collector
	- Workbench
		- Unlocks the ability to repair items
	- Christmas Tree
- Item Crafting
	- Items are marked found-in-raid on completion
	- Continues to track crafting progress even when server is not running

## Weapon Building

The weapon building system has been fully implemented.

- Create Weapon Presets
- Saving Presets
- Load Presets

## Raids

The in-raid systems included are as follows.

- Maps
	- Customs
	- Factory Day
	- Factory Night
	- Ground Zero
	- Interchange
	- Laboratory
	- Lighthouse
	- Reserve
	- Shoreline
	- Streets
	- Woods
- Loot
	- Loot spawning has been generated using over 100,000 EFT offline loot runs.
	- Static Loot (in containers)
		- Each container type can contain items appropriate to that container type found in offline EFT.
	- Loose Loot (on map)
		- Randomised loose items found on map in offline EFT.
- Airdrops
	- Randomised Spawn Chance
	- Request with Red Flare
	- Crate Types:
		- Weapons & Armour
		- Food & Medical
		- Barter Goods
		- Mixed - *mixture of any of the above items*
	- Supported Maps:
		- Customs
		- Interchange
		- Lighthouse
		- Reserve
		- Shoreline
		- Streets
		- Woods
- Persisted Raid Damage - *extracting with injury will persist injury out of raid*
- Scav Raids - *raid time and items are reduced to simulate entering a raid late*

## Messages

A messaging system has been implemented to allow for the following functionality.

- Receive messages (with item attachments) from traders or "system"
- Pin/unpin senders within the message list
- Receive all (or individual) attachments
- Send messages to "Commando" friend to execute server commands

## Events

The following events have been implemented and have a set time period for when they will be active.

- Snow
- Halloween
- Christmas

## Modding

- The Server project has been built to allow for extensive modifications to nearly any aspect and system used.
- [Example mods](https://dev.sp-tarkov.com/chomp/ModExamples) are provided that cover the most common modding methods.
