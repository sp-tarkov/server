import { inject, injectable } from "tsyringe";

import { BotGenerator } from "@spt-aki/generators/BotGenerator";
import { BotGeneratorHelper } from "@spt-aki/helpers/BotGeneratorHelper";
import { BotHelper } from "@spt-aki/helpers/BotHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IBotBase, Settings, Skills, Stats } from "@spt-aki/models/eft/common/tables/IBotBase";
import { IBotType } from "@spt-aki/models/eft/common/tables/IBotType";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { AccountTypes } from "@spt-aki/models/enums/AccountTypes";
import { BonusType } from "@spt-aki/models/enums/BonusType";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { ItemAddedResult } from "@spt-aki/models/enums/ItemAddedResult";
import { MemberCategory } from "@spt-aki/models/enums/MemberCategory";
import { Traders } from "@spt-aki/models/enums/Traders";
import { IPlayerScavConfig, KarmaLevel } from "@spt-aki/models/spt/config/IPlayerScavConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { SaveServer } from "@spt-aki/servers/SaveServer";
import { BotLootCacheService } from "@spt-aki/services/BotLootCacheService";
import { FenceService } from "@spt-aki/services/FenceService";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

@injectable()
export class PlayerScavGenerator
{
    protected playerScavConfig: IPlayerScavConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("BotGeneratorHelper") protected botGeneratorHelper: BotGeneratorHelper,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("FenceService") protected fenceService: FenceService,
        @inject("BotLootCacheService") protected botLootCacheService: BotLootCacheService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("BotGenerator") protected botGenerator: BotGenerator,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.playerScavConfig = this.configServer.getConfig(ConfigTypes.PLAYERSCAV);
    }

    /**
     * Update a player profile to include a new player scav profile
     * @param sessionID session id to specify what profile is updated
     * @returns profile object
     */
    public generate(sessionID: string): IPmcData
    {
        // get karma level from profile
        const profile = this.saveServer.getProfile(sessionID);
        const pmcDataClone = this.jsonUtil.clone(profile.characters.pmc);
        const existingScavDataClone = this.jsonUtil.clone(profile.characters.scav);

        const scavKarmaLevel = this.getScavKarmaLevel(pmcDataClone);

        // use karma level to get correct karmaSettings
        const playerScavKarmaSettings = this.playerScavConfig.karmaLevel[scavKarmaLevel];
        if (!playerScavKarmaSettings)
        {
            this.logger.error(this.localisationService.getText("scav-missing_karma_settings", scavKarmaLevel));
        }

        this.logger.debug(`generated player scav loadout with karma level ${scavKarmaLevel}`);

        // Edit baseBotNode values
        const baseBotNode: IBotType = this.constructBotBaseTemplate(playerScavKarmaSettings.botTypeForLoot);
        this.adjustBotTemplateWithKarmaSpecificSettings(playerScavKarmaSettings, baseBotNode);

        let scavData = this.botGenerator.generatePlayerScav(
            sessionID,
            playerScavKarmaSettings.botTypeForLoot.toLowerCase(),
            "easy",
            baseBotNode,
        );

        // Remove cached bot data after scav was generated
        this.botLootCacheService.clearCache();

        // Add scav metadata
        scavData.savage = null;
        scavData.aid = pmcDataClone.aid;
        scavData.TradersInfo = pmcDataClone.TradersInfo;
        scavData.Info.Settings = {} as Settings;
        scavData.Info.Bans = [];
        scavData.Info.RegistrationDate = pmcDataClone.Info.RegistrationDate;
        scavData.Info.GameVersion = pmcDataClone.Info.GameVersion;
        scavData.Info.MemberCategory = MemberCategory.UNIQUE_ID;
        scavData.Info.lockedMoveCommands = true;
        scavData.RagfairInfo = pmcDataClone.RagfairInfo;
        scavData.UnlockedInfo = pmcDataClone.UnlockedInfo;

        // Persist previous scav data into new scav
        scavData._id = existingScavDataClone._id ?? pmcDataClone.savage;
        scavData.sessionId = existingScavDataClone.sessionId ?? pmcDataClone.sessionId;
        scavData.Skills = this.getScavSkills(existingScavDataClone);
        scavData.Stats = this.getScavStats(existingScavDataClone);
        scavData.Info.Level = this.getScavLevel(existingScavDataClone);
        scavData.Info.Experience = this.getScavExperience(existingScavDataClone);
        scavData.Quests = existingScavDataClone.Quests ?? [];
        scavData.TaskConditionCounters = existingScavDataClone.TaskConditionCounters ?? {};
        scavData.Notes = existingScavDataClone.Notes ?? { Notes: [] };
        scavData.WishList = existingScavDataClone.WishList ?? [];
        scavData.Encyclopedia = pmcDataClone.Encyclopedia;

        // Add additional items to player scav as loot
        this.addAdditionalLootToPlayerScavContainers(playerScavKarmaSettings.lootItemsToAddChancePercent, scavData, [
            "TacticalVest",
            "Pockets",
            "Backpack",
        ]);

        // Remove secure container
        scavData = this.profileHelper.removeSecureContainer(scavData);

        // Set cooldown timer
        scavData = this.setScavCooldownTimer(scavData, pmcDataClone);

        // Add scav to the profile
        this.saveServer.getProfile(sessionID).characters.scav = scavData;

        return scavData;
    }

    /**
     * Add items picked from `playerscav.lootItemsToAddChancePercent`
     * @param possibleItemsToAdd dict of tpl + % chance to be added
     * @param scavData
     * @param containersToAddTo Possible slotIds to add loot to
     */
    protected addAdditionalLootToPlayerScavContainers(
        possibleItemsToAdd: Record<string, number>,
        scavData: IBotBase,
        containersToAddTo: string[],
    ): void
    {
        for (const tpl in possibleItemsToAdd)
        {
            const shouldAdd = this.randomUtil.getChance100(possibleItemsToAdd[tpl]);
            if (!shouldAdd)
            {
                continue;
            }

            const itemResult = this.itemHelper.getItem(tpl);
            if (!itemResult[0])
            {
                this.logger.warning(`Unable to add ${tpl} to player scav, not an item`);
                continue;
            }

            const itemTemplate = itemResult[1];
            const itemsToAdd: Item[] = [{
                _id: this.hashUtil.generate(),
                _tpl: itemTemplate._id,
                ...this.botGeneratorHelper.generateExtraPropertiesForItem(itemTemplate),
            }];

            const result = this.botGeneratorHelper.addItemWithChildrenToEquipmentSlot(
                containersToAddTo,
                itemsToAdd[0]._id,
                itemTemplate._id,
                itemsToAdd,
                scavData.Inventory,
            );

            if (result !== ItemAddedResult.SUCCESS)
            {
                this.logger.debug(`Unable to add keycard to bot. Reason: ${ItemAddedResult[result]}`);
            }
        }
    }

    /**
     * Get the scav karama level for a profile
     * Is also the fence trader rep level
     * @param pmcData pmc profile
     * @returns karma level
     */
    protected getScavKarmaLevel(pmcData: IPmcData): number
    {
        const fenceInfo = pmcData.TradersInfo[Traders.FENCE];

        // Can be empty during profile creation
        if (!fenceInfo)
        {
            this.logger.warning(this.localisationService.getText("scav-missing_karma_level_getting_default"));

            return 0;
        }

        if (fenceInfo.standing > 6)
        {
            return 6;
        }

        // e.g. 2.09 becomes 2
        return Math.floor(fenceInfo.standing);
    }

    /**
     * Get a baseBot template
     * If the parameter doesnt match "assault", take parts from the loot type and apply to the return bot template
     * @param botTypeForLoot bot type to use for inventory/chances
     * @returns IBotType object
     */
    protected constructBotBaseTemplate(botTypeForLoot: string): IBotType
    {
        const baseScavType = "assault";
        const assaultBase = this.jsonUtil.clone(this.botHelper.getBotTemplate(baseScavType));

        // Loot bot is same as base bot, return base with no modification
        if (botTypeForLoot === baseScavType)
        {
            return assaultBase;
        }

        const lootBase = this.jsonUtil.clone(this.botHelper.getBotTemplate(botTypeForLoot));
        assaultBase.inventory = lootBase.inventory;
        assaultBase.chances = lootBase.chances;
        assaultBase.generation = lootBase.generation;

        return assaultBase;
    }

    /**
     * Adjust equipment/mod/item generation values based on scav karma levels
     * @param karmaSettings Values to modify the bot template with
     * @param baseBotNode bot template to modify according to karama level settings
     */
    protected adjustBotTemplateWithKarmaSpecificSettings(karmaSettings: KarmaLevel, baseBotNode: IBotType): void
    {
        // Adjust equipment chance values
        for (const equipmentKey in karmaSettings.modifiers.equipment)
        {
            if (karmaSettings.modifiers.equipment[equipmentKey] === 0)
            {
                continue;
            }

            baseBotNode.chances.equipment[equipmentKey] += karmaSettings.modifiers.equipment[equipmentKey];
        }

        // Adjust mod chance values
        for (const modKey in karmaSettings.modifiers.mod)
        {
            if (karmaSettings.modifiers.mod[modKey] === 0)
            {
                continue;
            }

            baseBotNode.chances.weaponMods[modKey] += karmaSettings.modifiers.mod[modKey];
        }

        // Adjust item spawn quantity values
        for (const itemLimitkey in karmaSettings.itemLimits)
        {
            baseBotNode.generation.items[itemLimitkey] = karmaSettings.itemLimits[itemLimitkey];
        }

        // Blacklist equipment
        for (const equipmentKey in karmaSettings.equipmentBlacklist)
        {
            const blacklistedItemTpls = karmaSettings.equipmentBlacklist[equipmentKey];
            for (const itemToRemove of blacklistedItemTpls)
            {
                delete baseBotNode.inventory.equipment[equipmentKey][itemToRemove];
            }
        }
    }

    protected getScavSkills(scavProfile: IPmcData): Skills
    {
        if (scavProfile.Skills)
        {
            return scavProfile.Skills;
        }

        return this.getDefaultScavSkills();
    }

    protected getDefaultScavSkills(): Skills
    {
        return { Common: [], Mastering: [], Points: 0 };
    }

    protected getScavStats(scavProfile: IPmcData): Stats
    {
        if (scavProfile.Stats)
        {
            return scavProfile.Stats;
        }

        return this.profileHelper.getDefaultCounters();
    }

    protected getScavLevel(scavProfile: IPmcData): number
    {
        // Info can be null on initial account creation
        if (!(scavProfile.Info?.Level))
        {
            return 1;
        }

        return scavProfile.Info.Level;
    }

    protected getScavExperience(scavProfile: IPmcData): number
    {
        // Info can be null on initial account creation
        if (!(scavProfile.Info?.Experience))
        {
            return 0;
        }

        return scavProfile.Info.Experience;
    }

    /**
     * Set cooldown till pscav is playable
     * take into account scav cooldown bonus
     * @param scavData scav profile
     * @param pmcData pmc profile
     * @returns
     */
    protected setScavCooldownTimer(scavData: IPmcData, pmcData: IPmcData): IPmcData
    {
        // Set cooldown time.
        // Make sure to apply ScavCooldownTimer bonus from Hideout if the player has it.
        let scavLockDuration = this.databaseServer.getTables().globals.config.SavagePlayCooldown;
        let modifier = 1;

        for (const bonus of pmcData.Bonuses)
        {
            if (bonus.type === BonusType.SCAV_COOLDOWN_TIMER)
            {
                // Value is negative, so add.
                // Also note that for scav cooldown, multiple bonuses stack additively.
                modifier += bonus.value / 100;
            }
        }

        const fenceInfo = this.fenceService.getFenceInfo(pmcData);
        modifier *= fenceInfo.SavageCooldownModifier;
        scavLockDuration *= modifier;

        const fullProfile = this.profileHelper.getFullProfile(pmcData?.sessionId);
        if (fullProfile?.info?.edition?.toLowerCase?.().startsWith?.(AccountTypes.SPT_DEVELOPER))
        {
            // Set scav cooldown timer to 10 seconds for spt developer account
            scavLockDuration = 10;
        }

        scavData.Info.SavageLockTime = (Date.now() / 1000) + scavLockDuration;

        return scavData;
    }
}
