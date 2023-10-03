import { inject, injectable } from "tsyringe";

import { BotHelper } from "../helpers/BotHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { IConfig } from "../models/eft/common/IGlobals";
import { Inventory } from "../models/eft/common/tables/IBotType";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { SeasonalEventType } from "../models/enums/SeasonalEventType";
import { IHttpConfig } from "../models/spt/config/IHttpConfig";
import { IQuestConfig } from "../models/spt/config/IQuestConfig";
import { ISeasonalEvent, ISeasonalEventConfig } from "../models/spt/config/ISeasonalEventConfig";
import { ILocationData } from "../models/spt/server/ILocations";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { DatabaseImporter } from "../utils/DatabaseImporter";
import { GiftService } from "./GiftService";
import { LocalisationService } from "./LocalisationService";

@injectable()
export class SeasonalEventService
{
    protected seasonalEventConfig: ISeasonalEventConfig;
    protected questConfig: IQuestConfig;
    protected httpConfig: IHttpConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("DatabaseImporter") protected databaseImporter: DatabaseImporter,
        @inject("GiftService") protected giftService: GiftService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.seasonalEventConfig = this.configServer.getConfig(ConfigTypes.SEASONAL_EVENT);
        this.questConfig = this.configServer.getConfig(ConfigTypes.QUEST);
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
    }

    protected get christmasEventItems(): string[]
    {
        return [
            "5c1a1e3f2e221602b66cc4c2", // White beard
            "5df8a6a186f77412640e2e80", // Red bauble
            "5df8a77486f77412672a1e3f", // Violet bauble
            "5df8a72c86f77412640e2e83", // Silver bauble
            "5a43943586f77416ad2f06e2", // Ded moroz hat
            "5a43957686f7742a2c2f11b0" // Santa hat
        ];
    }

    protected get halloweenEventItems(): string[]
    {
        return [
            "635267ab3c89e2112001f826", // Halloween skull mask
            "634959225289190e5e773b3b", // Pumpkin loot box
            "59ef13ca86f77445fd0e2483" // Jack'o'lantern helmet
        ];
    }

    /**
     * Get an array of christmas items found in bots inventories as loot
     * @returns array
     */
    public getChristmasEventItems(): string[]
    {
        return this.christmasEventItems;
    }

    /**
     * Get an array of halloween items found in bots inventories as loot
     * @returns array
     */
    public getHalloweenEventItems(): string[]
    {
        return this.halloweenEventItems;
    }

    public itemIsChristmasRelated(itemTpl: string): boolean
    {
        return this.christmasEventItems.includes(itemTpl);
    }

    public itemIsHalloweenRelated(itemTpl: string): boolean
    {
        return this.halloweenEventItems.includes(itemTpl);
    }

    /**
     * Check if item id exists in christmas or halloween event arrays
     * @param itemTpl item tpl to check for
     * @returns 
     */
    public itemIsSeasonalRelated(itemTpl: string): boolean
    {
        return this.christmasEventItems.includes(itemTpl) || this.halloweenEventItems.includes(itemTpl);
    }

    /**
     * Get an array of items that appear during a seasonal event
     * returns multiple seasonal event items if they are both active
     * @returns array of tpl strings
     */
    public getAllSeasonalEventItems(): string[]
    {
        const items = [];

        if (!this.christmasEventEnabled())
        {
            items.push(...this.christmasEventItems);
        }

        if (!this.halloweenEventEnabled())
        {
            items.push(...this.halloweenEventItems);
        }

        return items;
    }

    /**
     * Get an array of seasonal items that should be blocked as season is not currently active
     * @returns Array of tpl strings
     */
    public getSeasonalEventItemsToBlock(): string[]
    {
        const items = [];

        if (!this.christmasEventEnabled())
        {
            items.push(...this.christmasEventItems);
        }

        if (!this.halloweenEventEnabled())
        {
            items.push(...this.halloweenEventItems);
        }

        return items;
    }

    /**
     * Is a seasonal event currently active
     * @returns true if event is active
     */
    public seasonalEventEnabled(): boolean
    {
        return this.databaseServer.getTables().globals.config.EventType.includes(SeasonalEventType.CHRISTMAS) ||
            this.databaseServer.getTables().globals.config.EventType.includes(SeasonalEventType.HALLOWEEN);
    }

    /**
     * Is christmas event active (Globals eventtype array contains even name)
     * @returns true if active
     */
    public christmasEventEnabled(): boolean
    {
        return this.databaseServer.getTables().globals.config.EventType.includes(SeasonalEventType.CHRISTMAS);
    }

    /**
     * is halloween event active (Globals eventtype array contains even name)
     * @returns true if active
     */
    public halloweenEventEnabled(): boolean
    {
        return this.databaseServer.getTables().globals.config.EventType.includes(SeasonalEventType.HALLOWEEN);
    }

    /**
     * Is detection of seasonal events enabled (halloween / christmas)
     * @returns true if seasonal events should be checked for
     */
    public isAutomaticEventDetectionEnabled(): boolean
    {
        return this.seasonalEventConfig.enableSeasonalEventDetection;
    }

    /**
     * Get a dictionary of gear changes to apply to bots for a specific event e.g. Christmas/Halloween
     * @param eventName Name of event to get gear changes for
     * @returns bots with equipment changes
     */
    protected getEventBotGear(eventType: SeasonalEventType): Record<string, Record<string, Record<string, number>>>
    {
        return this.seasonalEventConfig.eventGear[eventType.toLowerCase()];
    }

    /**
     * Get the dates each seasonal event starts and ends at
     * @returns Record with event name + start/end date
     */
    public getEventDetails(): ISeasonalEvent[]
    {
        return this.seasonalEventConfig.events;
    }

    /**
     * Look up quest in configs/quest.json
     * @param questId Quest to look up
     * @param event event type (Christmas/Halloween/None)
     * @returns true if related
     */
    public isQuestRelatedToEvent(questId: string, event: SeasonalEventType): boolean
    {
        const eventQuestData = this.questConfig.eventQuests[questId];
        if (eventQuestData?.season.toLowerCase() === event.toLowerCase())
        {
            return true;
        }

        return false;
    }

    /**
     * Check if current date falls inside any of the seasons events pased in, if so, handle them
     * @param sessionId Players id
     */
    public checkForAndEnableSeasonalEvents(sessionId: string): void
    {
        const globalConfig = this.databaseServer.getTables().globals.config;
        const currentDate = new Date();
        const seasonalEvents = this.getEventDetails();

        for (const event of seasonalEvents)
        {
            const eventStartDate = new Date(currentDate.getFullYear(), event.startMonth - 1, event.startDay);
            const eventEndDate = new Date(currentDate.getFullYear(), event.endMonth - 1, event.endDay);

            // Current date is between start/end dates
            if (currentDate >= eventStartDate
                && currentDate <= eventEndDate)
            {
                this.updateGlobalEvents(sessionId, globalConfig, event.type);
            }
        }
    }

    /**
     * Iterate through bots inventory and loot to find and remove christmas items (as defined in SeasonalEventService)
     * @param nodeInventory Bots inventory to iterate over
     * @param botRole the role of the bot being processed
     */
    public removeChristmasItemsFromBotInventory(nodeInventory: Inventory, botRole: string): void
    {
        const christmasItems = this.getChristmasEventItems();
        const equipmentSlotsToFilter = ["FaceCover", "Headwear", "Backpack", "TacticalVest"];
        const lootContainersToFilter = ["Backpack", "Pockets", "TacticalVest"];

        // Remove christmas related equipment
        for (const equipmentSlotKey of equipmentSlotsToFilter)
        {
            if (!nodeInventory.equipment[equipmentSlotKey])
            {
                this.logger.warning(this.localisationService.getText("seasonal-missing_equipment_slot_on_bot", {equipmentSlot: equipmentSlotKey, botRole: botRole}));
            }

            const equipment: Record<string, number> = nodeInventory.equipment[equipmentSlotKey];
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            nodeInventory.equipment[equipmentSlotKey] = Object.fromEntries(Object.entries(equipment).filter(([index]) => !christmasItems.includes(index)));
        }

        // Remove christmas related loot from loot containers
        for (const lootContainerKey of lootContainersToFilter)
        {
            if (!nodeInventory.items[lootContainerKey])
            {
                this.logger.warning(this.localisationService.getText("seasonal-missing_loot_container_slot_on_bot", {lootContainer: lootContainerKey, botRole: botRole}));
            }

            nodeInventory.items[lootContainerKey] = nodeInventory.items[lootContainerKey].filter((x: string) => !christmasItems.includes(x));
        }
    }

    /**
     * Make adjusted to server code based on the name of the event passed in
     * @param sessionId Player id
     * @param globalConfig globals.json
     * @param eventName Name of the event to enable. e.g. Christmas
     */
    protected updateGlobalEvents(sessionId: string, globalConfig: IConfig, eventType: SeasonalEventType): void
    {
        switch (eventType.toLowerCase())
        {
            case SeasonalEventType.HALLOWEEN.toLowerCase():
                globalConfig.EventType = globalConfig.EventType.filter(x => x !== "None");
                globalConfig.EventType.push("Halloween");
                globalConfig.EventType.push("HalloweenIllumination");
                globalConfig.Health.ProfileHealthSettings.DefaultStimulatorBuff = "Buffs_Halloween";
                this.addEventGearToBots(eventType);
                this.addPumpkinsToScavBackpacks();
                this.adjustTraderIcons(eventType);
                break;
            case SeasonalEventType.CHRISTMAS.toLowerCase():
                globalConfig.EventType = globalConfig.EventType.filter(x => x !== "None");
                globalConfig.EventType.push("Christmas");
                this.addEventGearToBots(eventType);
                this.addGifterBotToMaps();
                this.addLootItemsToGifterDropItemsList();
                this.enableDancingTree();
                this.giveGift(sessionId, "Christmas2022");
                break;
            case SeasonalEventType.NEW_YEARS.toLowerCase():
                this.giveGift(sessionId, "NewYear2021");
                break;
            default:
                // Likely a mod event
                this.addEventGearToBots(eventType);
                break;
        }
    }

    /**
     * Change trader icons to be more event themed (Halloween only so far)
     * @param eventType What event is active
     */
    protected adjustTraderIcons(eventType: SeasonalEventType): void
    {
        switch (eventType.toLowerCase())
        {
            case SeasonalEventType.HALLOWEEN.toLowerCase():
                this.httpConfig.serverImagePathOverride["./assets/images/traders/5a7c2ebb86f7746e324a06ab.png"] = "./assets/images/traders/halloween/5a7c2ebb86f7746e324a06ab.png";
                this.httpConfig.serverImagePathOverride["./assets/images/traders/5ac3b86a86f77461491d1ad8.png"] = "./assets/images/traders/halloween/5ac3b86a86f77461491d1ad8.png";
                this.httpConfig.serverImagePathOverride["Aki_Data/Server/images/traders/5c06531a86f7746319710e1b.png"] = "Aki_Data/Server/images/traders/halloween/5c06531a86f7746319710e1b.png";
                this.httpConfig.serverImagePathOverride["Aki_Data/Server/images/traders/59b91ca086f77469a81232e4.png"] = "Aki_Data/Server/images/traders/halloween/59b91ca086f77469a81232e4.png";
                this.httpConfig.serverImagePathOverride["Aki_Data/Server/images/traders/59b91cab86f77469aa5343ca.png"] = "Aki_Data/Server/images/traders/halloween/59b91cab86f77469aa5343ca.png";
                this.httpConfig.serverImagePathOverride["Aki_Data/Server/images/traders/59b91cb486f77469a81232e5.png"] = "Aki_Data/Server/images/traders/halloween/59b91cb486f77469a81232e5.png";
                this.httpConfig.serverImagePathOverride["Aki_Data/Server/images/traders/59b91cbd86f77469aa5343cb.png"] = "Aki_Data/Server/images/traders/halloween/59b91cbd86f77469aa5343cb.png";
                this.httpConfig.serverImagePathOverride["Aki_Data/Server/images/traders/579dc571d53a0658a154fbec.png"] = "Aki_Data/Server/images/traders/halloween/579dc571d53a0658a154fbec.png"; 
                break; 
            case SeasonalEventType.CHRISTMAS.toLowerCase():
                // TODO: find christmas trader icons
                break;
        }

        this.databaseImporter.loadImages(`${this.databaseImporter.getSptDataPath()}images/`, ["traders"], ["/files/trader/avatar/"]);
    }

    /**
     * Add lootble items from backpack into patrol.ITEMS_TO_DROP difficulty property
     */
    protected addLootItemsToGifterDropItemsList(): void
    {
        const gifterBot = this.databaseServer.getTables().bots.types["gifter"];
        for (const difficulty in gifterBot.difficulty)
        {
            gifterBot.difficulty[difficulty].Patrol["ITEMS_TO_DROP"] = gifterBot.inventory.items.Backpack.join(", ");
        }
    }

    /**
     * Read in data from seasonalEvents.json and add found equipment items to bots
     * @param eventName Name of the event to read equipment in from config
     */
    protected addEventGearToBots(eventType: SeasonalEventType): void
    {
        const botGearChanges = this.getEventBotGear(eventType);
        if (!botGearChanges)
        {
            this.logger.warning(this.localisationService.getText("gameevent-no_gear_data", eventType));

            return;
        }
        
        // Iterate over bots with changes to apply
        for (const bot in botGearChanges)
        {
            const botToUpdate = this.databaseServer.getTables().bots.types[bot.toLowerCase()];
            if (!botToUpdate)
            {
                this.logger.warning(this.localisationService.getText("gameevent-bot_not_found", bot));
                continue;
            }

            // Iterate over each equipment slot change
            const gearAmendments = botGearChanges[bot];
            for (const equipmentSlot in gearAmendments)
            {
                // Grab gear to add and loop over it
                const itemsToAdd = gearAmendments[equipmentSlot];
                for (const itemTplIdToAdd in itemsToAdd)
                {
                    botToUpdate.inventory.equipment[equipmentSlot][itemTplIdToAdd] = itemsToAdd[itemTplIdToAdd];
                }
            }
        }
    }

    protected addPumpkinsToScavBackpacks(): void
    {
        const assaultBackpack = this.databaseServer.getTables().bots.types["assault"].inventory.items.Backpack;
        assaultBackpack.push("634959225289190e5e773b3b");
        assaultBackpack.push("634959225289190e5e773b3b");
        assaultBackpack.push("634959225289190e5e773b3b");
    }

    /**
     * Set Khorovod(dancing tree) chance to 100% on all maps that support it
     */
    protected enableDancingTree(): void
    {
        const maps = this.databaseServer.getTables().locations;
        for (const mapName in maps)
        {
            // Skip maps that have no tree
            if (["hideout", "base", "privatearea"].includes(mapName))
            {
                continue;
            }

            const mapData: ILocationData = maps[mapName];
            if (mapData?.base?.BotLocationModifier && "KhorovodChance" in mapData.base.BotLocationModifier)
            {
                mapData.base.BotLocationModifier.KhorovodChance = 100;
            }
        }
    }

    /**
     * Add santa to maps
     */
    protected addGifterBotToMaps(): void
    {
        const gifterSettings = this.seasonalEventConfig.gifterSettings;
        const maps = this.databaseServer.getTables().locations;
        for (const gifterMapSettings of gifterSettings)
        {
            const mapData: ILocationData = maps[gifterMapSettings.map];
            mapData.base.BossLocationSpawn.push({
                BossName: "gifter",
                BossChance: gifterMapSettings.spawnChance,
                BossZone: gifterMapSettings.zones,
                BossPlayer: false,
                BossDifficult: "normal",
                BossEscortType: "gifter",
                BossEscortDifficult: "normal",
                BossEscortAmount: "0",
                Time: -1,
                TriggerId: "",
                TriggerName: "",
                Delay: 0,
                RandomTimeSpawn: false
            });
        }
    }

    /**
     * Send gift to player if they'e not already received it
     * @param playerId Player to send gift to
     * @param giftkey Key of gift to give
     */
    protected giveGift(playerId: string, giftkey: string): void
    {
        if (!this.profileHelper.playerHasRecievedGift(playerId, giftkey))
        {
            this.giftService.sendGiftToPlayer(playerId, giftkey);
        }
        
    }
}