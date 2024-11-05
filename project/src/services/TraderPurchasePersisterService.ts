import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { ITraderPurchaseData } from "@spt/models/eft/profile/ISptProfile";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ITraderConfig } from "@spt/models/spt/config/ITraderConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { LocalisationService } from "@spt/services/LocalisationService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { inject, injectable } from "tsyringe";

/**
 * Help with storing limited item purchases from traders in profile to persist them over server restarts
 */
@injectable()
export class TraderPurchasePersisterService {
    protected traderConfig: ITraderConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
    }

    /**
     * Get the purchases made from a trader for this profile before the last trader reset
     * @param sessionId Session id
     * @param traderId Trader to loop up purchases for
     * @returns Dict of assort id and count purchased
     */
    public getProfileTraderPurchases(
        sessionId: string,
        traderId: string,
    ): Record<string, ITraderPurchaseData> | undefined {
        const profile = this.profileHelper.getFullProfile(sessionId);

        if (!profile.traderPurchases) {
            return undefined;
        }

        return profile.traderPurchases[traderId];
    }

    /**
     * Get a purchase made from a trader for requested profile before the last trader reset
     * @param sessionId Session id
     * @param traderId Trader to loop up purchases for
     * @param assortId Id of assort to get data for
     * @returns TraderPurchaseData
     */
    public getProfileTraderPurchase(
        sessionId: string,
        traderId: string,
        assortId: string,
    ): ITraderPurchaseData | undefined {
        const profile = this.profileHelper.getFullProfile(sessionId);

        if (!profile.traderPurchases) {
            return undefined;
        }

        const traderPurchases = profile.traderPurchases[traderId];
        if (!traderPurchases) {
            return undefined;
        }

        return traderPurchases[assortId];
    }

    /**
     * Remove all trader purchase records from all profiles that exist
     * @param traderId Traders id
     */
    public resetTraderPurchasesStoredInProfile(traderId: string): void {
        // Reset all profiles purchase dictionaries now a trader update has occured;
        const profiles = this.profileHelper.getProfiles();
        for (const profile of Object.values(profiles)) {
            // Skip if no purchases
            if (!profile.traderPurchases) {
                continue;
            }

            // Skip if no trader-speicifc purchases
            if (!profile.traderPurchases[traderId]) {
                continue;
            }

            profile.traderPurchases[traderId] = {};
        }
    }

    /**
     * Iterate over all server profiles and remove specific trader purchase data that has passed the trader refesh time
     * @param traderId Trader id
     */
    public removeStalePurchasesFromProfiles(traderId: string): void {
        const profiles = this.profileHelper.getProfiles();
        for (const profile of Object.values(profiles)) {
            // Skip if no purchases
            if (!profile.traderPurchases) {
                continue;
            }

            // Skip if no trader-specifc purchases
            if (!profile.traderPurchases[traderId]) {
                continue;
            }

            for (const purchaseKey in profile.traderPurchases[traderId]) {
                const traderUpdateDetails = this.traderConfig.updateTime.find((x) => x.traderId === traderId);
                if (!traderUpdateDetails) {
                    this.logger.error(
                        this.localisationService.getText("trader-unable_to_delete_stale_purchases", {
                            profileId: profile.info.id,
                            traderId: traderId,
                        }),
                    );

                    continue;
                }

                const purchaseDetails = profile.traderPurchases[traderId][purchaseKey];
                const resetTimeForItem =
                    purchaseDetails.purchaseTimestamp +
                    this.randomUtil.getInt(traderUpdateDetails.seconds.min, traderUpdateDetails.seconds.max);
                if (resetTimeForItem < this.timeUtil.getTimestamp()) {
                    // Item was purchased far enough in past a trader refresh would have occured, remove purchase record from profile
                    this.logger.debug(
                        `Removed trader: ${traderId} purchase: ${purchaseKey} from profile: ${profile.info.id}`,
                    );
                    delete profile.traderPurchases[traderId][purchaseKey];
                }
            }
        }
    }
}
