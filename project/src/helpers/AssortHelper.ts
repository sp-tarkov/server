import { inject, injectable } from "tsyringe";

import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { QuestHelper } from "@spt-aki/helpers/QuestHelper";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { ITraderAssort } from "@spt-aki/models/eft/common/tables/ITrader";
import { QuestStatus } from "@spt-aki/models/enums/QuestStatus";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";

@injectable()
export class AssortHelper
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("QuestHelper") protected questHelper: QuestHelper,
    )
    {}

    /**
     * Remove assorts from a trader that have not been unlocked yet (via player completing corresponding quest)
     * @param pmcProfile Player profile
     * @param traderId Traders id the assort belongs to
     * @param traderAssorts All assort items from same trader
     * @param mergedQuestAssorts Dict of quest assort to quest id unlocks for all traders (key = started/failed/complete)
     * @returns Assort items minus locked quest assorts
     */
    public stripLockedQuestAssort(
        pmcProfile: IPmcData,
        traderId: string,
        traderAssorts: ITraderAssort,
        mergedQuestAssorts: Record<string, Record<string, string>>,
        flea = false,
    ): ITraderAssort
    {
        // Trader assort does not always contain loyal_level_items
        if (!traderAssorts.loyal_level_items)
        {
            this.logger.warning(this.localisationService.getText("assort-missing_loyalty_level_object", traderId));

            return traderAssorts;
        }

        // Iterate over all assorts, removing items that don't fulfil the requirements
        for (const assortId in traderAssorts.loyal_level_items)
        {
            // Get quest id that unlocks assort + statuses quest can be in to show assort
            const unlockValues = this.getQuestIdAndStatusThatShowAssort(mergedQuestAssorts, assortId);
            if (!unlockValues)
            {
                continue;
            }

            // Remove assort if quest in profile does not have status that unlocks assort
            const questStatusInProfile = this.questHelper.getQuestStatus(pmcProfile, unlockValues.questId);
            if (!unlockValues.status.includes(questStatusInProfile))
            {
                traderAssorts = this.removeItemFromAssort(traderAssorts, assortId, flea);
            }
        }

        return traderAssorts;
    }

    /**
     * Get a quest id + the statuses quest can be in to unlock assort
     * @param mergedQuestAssorts quest assorts to search for assort id
     * @param assortId Assort to look for linked quest id
     * @returns quest id + array of quest status the assort should show for
     */
    protected getQuestIdAndStatusThatShowAssort(
        mergedQuestAssorts: Record<string, Record<string, string>>,
        assortId: string,
    ): { questId: string; status: QuestStatus[]; }
    {
        if (assortId in mergedQuestAssorts.started)
        {
            // Assort unlocked by starting quest, assort is visible to player when : started or ready to hand in + handed in
            return {
                questId: mergedQuestAssorts.started[assortId],
                status: [QuestStatus.Started, QuestStatus.AvailableForFinish, QuestStatus.Success],
            };
        }

        if (assortId in mergedQuestAssorts.success)
        {
            return { questId: mergedQuestAssorts.success[assortId], status: [QuestStatus.Success] };
        }

        if (assortId in mergedQuestAssorts.fail)
        {
            return { questId: mergedQuestAssorts.fail[assortId], status: [QuestStatus.Fail] };
        }

        return undefined;
    }

    /**
     * Remove assorts from a trader that have not been unlocked yet
     * @param pmcProfile player profile
     * @param traderId traders id
     * @param assort traders assorts
     * @returns traders assorts minus locked loyalty assorts
     */
    public stripLockedLoyaltyAssort(pmcProfile: IPmcData, traderId: string, assort: ITraderAssort): ITraderAssort
    {
        // Trader assort does not always contain loyal_level_items
        if (!assort.loyal_level_items)
        {
            this.logger.warning(this.localisationService.getText("assort-missing_loyalty_level_object", traderId));

            return assort;
        }

        // Remove items not unlocked from quest status change (ASSORTMENT_UNLOCK)
        for (const itemId in assort.loyal_level_items)
        {
            if (assort.loyal_level_items[itemId] > pmcProfile.TradersInfo[traderId].loyaltyLevel)
            {
                assort = this.removeItemFromAssort(assort, itemId);
            }
        }

        return assort;
    }

    /**
     * Remove an item from an assort
     * @param assort assort to modify
     * @param itemID item id to remove from asort
     * @returns Modified assort
     */
    public removeItemFromAssort(assort: ITraderAssort, itemID: string, flea = false): ITraderAssort
    {
        const idsToRemove = this.itemHelper.findAndReturnChildrenByItems(assort.items, itemID);

        if (assort.barter_scheme[itemID] && flea)
        {
            for (const barterSchemes of assort.barter_scheme[itemID])
            {
                for (const barterScheme of barterSchemes)
                {
                    barterScheme.sptQuestLocked = true;
                }
            }
            return assort;
        }
        delete assort.barter_scheme[itemID];
        delete assort.loyal_level_items[itemID];

        for (const i in idsToRemove)
        {
            for (const a in assort.items)
            {
                if (assort.items[a]._id === idsToRemove[i])
                {
                    assort.items.splice(parseInt(a), 1);
                }
            }
        }

        return assort;
    }
}
