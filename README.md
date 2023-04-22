# Server

Modding framework for Escape From Tarkov

[![Build Status](https://drone.sp-tarkov.com/api/badges/SPT-AKI/Server/status.svg?ref=refs/heads/development)](https://drone.sp-tarkov.com/SPT-AKI/Server)
[![Quality Gate Status](https://sonar.sp-tarkov.com/api/project_badges/measure?project=AKI&metric=alert_status&token=d3b87ff5fac591c1f49a57d4a2883c92bfe6a77f)](https://sonar.sp-tarkov.com/dashboard?id=AKI)

## Privacy
SPT is an open source project. Your commit credentials as author of a commit will be visible by anyone. Please make sure you understand this before submitting a PR.
Feel free to use a "fake" username and email on your commits by using the following commands:
```bash
git config --local user.name "USERNAME"
git config --local user.email "USERNAME@SOMETHING.com"
```

## Requirements

- NodeJS (with npm)
- Visual Studio Code
- git [LFS](https://git-lfs.github.com/)

## Observations

- The server was tested to work with **NodeJS 16.17.1**, if you are using a different version and experiencing difficulties change it before looking for support
- If you are updating a branch you've had for some time, run `npm ci` before running any tasks. This will run the clean and install target from npm.
- You can debug your mods using the server, just copy your mod files into the `user/mods` folder and put breakpoints on the **JS** files. **DO NOT** contact the dev team for support on this.

## Pulling
- Run `git lfs fetch` and `git lfs pull` to acquire loot files

## Setup

1. Visual Studio Code > File > Open Workspace... > `project\Server.code-workspace`
2. Visual Studio Code > Terminal > Run Task... > npm > npm: Install

## Build

This is for preparing for a release, not to run locally.

**Mode** | **Location**
-------- | -----------------------------------------------------------------
release  | Visual Studio Code > Terminal > Run Build Task... > build:release
debug    | Visual Studio Code > Terminal > Run Build Task... > build:debug

## Test / Run locally

Visual Studio Code > Run > Start Debugging

# Features

## Progression
Player profile is stored in SPT folder as a JSON file, allowing for changes to persist
- Scav:
	- Stats increase by doing scav raids
	- Skills increase by doing scav raids
	- Scav reputation system (Karma)
		- Scavs hostile below certain level
		- Scav run cooldown adjustment
		- Scav follow chance adjustment
		- Scav case
			- ~~Completion time adjustment~~ NOT IMPLEMENTED
			- ~~Equipment chance adjustment~~ NOT IMPLEMENTED
		- Bosses hostile below certain level
		- ~~Exfil price adjustment~~ NOT IMPLEMENTED
		- Improved gear with higher rep
		- Increase rep by exiting through car extracts
- PMC:
	- Stats increase by doing PMC raids
	- Skills increase by doing PMC raids
	- Hydration/food
		- Increase out of raid
		- Post-raid levels are persisted to profile
	- Raid stat tracking
		- Raid count
		- Survived count
		- KIA count
		- MIA count
		- AWOL count
		- Kills count

## Bots

 - Emulated bots:
	 - assault (scav)
	 - bossBully (Reshalla)
	 - bossGluhar
	 - bossKilla
	 - bossKnight
	 - bossKojainy (Shturman)
	 - bossSanitar
	 - bossTagilla
	 - bosszryachiy
	 - curedAssault
	 - exUsec (Rogue)
	 - followerBigPipe
		 - Grenade launcher
	 - followerBirdEye
	 - followerBully
	 - followerGluharAssault
	 - followerGluharScout
	 - followerGluharSecurity
	 - followerGluharSnipe
	 - followerKojaniy
	 - followerSanitar
	 - followerzryachiy
	 - gifter
		 - ~~Gives gifts~~ NOT IMPLEMENTED
	 - marksman
	 - pmcBot (raider)
	 - sectantPriest (Cultist)
	 - sectantWarrior (Cultist)
- Gear
	- Semi-randomised gear chosen with weighting system
	- Randomised durability of gear
- Ammo
	- Ammo weighting system
- Loot
	- Semi-randomised loot
	- Item type spawn limit system
- Per-map AI types

## PMCs
- Simulated PMC players
	 - Custom weapons
		 - Semi-randomly generated with weighting system
		 - Semi-randomly chosen ammo with weighting system
	 - Custom gear
		- Semi-randomly generated with weighting system
	 - Custom headgear
		 - Randomised attachments with percentage based chance to appear
			 - Face shields
			 - Flashlights
	 - Dogtags
		 - Random level
		 - Random name
	 - Voices
		 - Bear/usec voices for each faction
	 - Item blacklist/whitelist
	 - Item
	 - Highly configurable in config

## Inventory
 - Move/split/delete stacks
 - Tags (add/modify/remove)
 - Armor/weapon kit item repair
 - ~~Auto-sort~~ (SEMI-BROKEN - MOVES ITEMS OUT OF VISIBLE INVENTORY SPACE)
 - Out of raid healing
 - Out of raid eating
 - Special slots (compass etc)

## Traders
- Buy/Sell
- Listed items are refreshed every hour
- purchase limits per refresh period
- Track sold rouble count
- Loyalty levels
- Build reputation
- Item repair
	- Calculate randomised durability level based on item type/values
- Alternate clothing from Ragman
	- Buy/unlock new clothing
- Insurance
	- chance for items to be returned - higher chance for more expensive trader
	- Chance parts will be stripped from returned weapons
- Fence
	- Lists random items for sale
	- Emulated system of 'churn' for items sold by fence
		- every 4 minutes 20% of fences' items are replaced
	- Configurable through config

## Flea market
- Buy and sell items
- Prices pulled from live data
- Listing tax fee
- Offer filtering
- Offer search
- Filter by item
- Linked search
- Simulated player offers
	- Generated with random names/ratings/expiry times
	- Variable prices based on live price (20% above/below)
	- Weapon presets as offers
	- Bartering offers
	- Listed currency
		- Rouble
		- Euro
		- Dollar
- Rating
	- Increase flea rating by selling items
	- Decrease flea rating by failing to sell items
	- Will be purchased by simulated players
	- Greater chance listed item will be purchased the lower it is listed for
- Adjust flea prices that are massively below trader buy price
- Receive purchased item through mail from seller
- Sorting by
	- Rating
	- Price
	- Name
- Configurable using config

## Quests
- ~~Accurate quest list~~ INCOMPLETE (85% complete)
- Trader quests
	- Accept/Complete
- Daily Quests
	- Simulated system of daily quests
	- Replace daily quest
		- Replace quest with new one
		- Charged fee
	- Scav daily quests
	- Types
		- Elimination
		- Exit location
		- Find
- Trader item unlocks through completion of quests
- Receive mail from traders after accepting/completing/failing a quest
- Item rewards given through mail

## Hideout
- Areas supported
	- Air filter
		- Air filter degradation speed calculation
		- Skill levelling boost + 40%
	- Bitcoin farm
		- Coin generation speed calculation
	- Booze generator
		- Create moonshine
	- Generator
		- Fuel usage calculation
	- Heating
		- Energy regen rate
		- Negative effects removal rate x2
	- Illumination
	- Intel centre
		- ~~Unlocks scav tasks from fence~~ NOT IMPLEMENTED
		- ~~Reduces insurance return time by 20%~~ NOT IMPLEMENTED
		- Quest money reward boost
	- Lavatory
	- Library
	- Medstation
	- Nutrition unit
	- Rest space
	- Scav case
		- Custom reward system
		- Configurable in config
	- Security
	- Shooting range
	- Solar power
	- Stash
		- Gives bonus storage space
	- Vents
	- Water collector
	- Workbench
	- Christmas tree
- Item crafting
	- Found in raid on completion
	- Crafts when server not running

## Weapon building
- Create weapon presets
- Saving of presets

## Raids
- Supported maps
	- Customs
	- Factory day
	- Factory night
	- Reserve
	- Woods
	- Lighthouse
	- Laboratory
	- Shoreline
	- Streets
- Loot
	- Generated from over 30,000 loot runs on live, spawn chances calculated from all runs to give fairly accurate depiction of live loot.
	- Static loot (containers)
		- Each container type can contain items appropriate to that type
	- Loose loot
		- Randomised loose items found on map
- Airdrops
	- Randomised chance of spawning
	- Fire red flare to request an airdrop
	- ~~Drops 1 of 3 randomised loot crate types~~ NOT IMPLEMENTED
	- Drops lootable crate in:
		- Customs
		- Reserve
		- Woods
		- Lighthouse
		- Shoreline
		- Streets
	- Can be adjusted via config file
- Raid damage
	- Exiting a raid with injury to player character will be persisted out of raid
- Post-raid therapist healing

## Messages
- Receive from traders
- Pin/unpin senders
- Accept all attachments
- Accept individual mail attachment

## Modding
- Extensive system that allows for the modification of nearly any aspect of SPT
- Example mods covering a good slice of modding capabilities

## Misc
- Profiles
	- Standard/Left Behind/Prepare To Escape/Edge Of Darkness
	- Custom profiles
		- SPT Easy start
			- Lots of money / some QoL skills level 20 / level 69
		- SPT Zero to hero
			- No money, skills, trader rep or items, only a knife
		- SPT Developer
			- Testing profile, level 69, most skills maxed, max trader rep
			- USEC have all quests ready to start
			- BEAR have all quests ready to hand in
- Note system
	- Add
	- Edit
	- Delete
- Extensive config system
	- Alter how SPT works
- Holiday themes in hideout on appropriate days
	- Halloween
	- Christmas

## Code
- TypeScript
	- Majority of EFT request/response classes passed from client to server have been mapped
- Unit Tests
	- Supports tests via jest
- Dependency injection
- Config files accessible from `Aki_Data\Server\configs` / `project\assets\configs`