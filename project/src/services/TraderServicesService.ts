import { inject, injectable } from "tsyringe";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { QuestStatus } from "@spt/models/enums/QuestStatus";
import { TraderServiceType } from "@spt/models/enums/TraderServiceType";
import { ITraderServiceModel } from "@spt/models/spt/services/ITraderServiceModel";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { ICloner } from "@spt/utils/cloners/ICloner";

@injectable()
export class TraderServicesService
{
    constructor(
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    )
    {}

    public getTraderServices(sessionId: string, traderId: string): ITraderServiceModel[]
    {
        const pmcData = this.profileHelper.getPmcProfile(sessionId);
        let traderServices = this.cloner.clone(this.databaseServer.getTables().traders![traderId]?.services);
        if (!traderServices)
        {
            return [];
        }

        // Filter out any service the user doesn't meet the conditions for
        const servicesToDelete: TraderServiceType[] = [];
        for (const service of traderServices)
        {
            if (service.requirements?.standings)
            {
                for (const [standingTrader, standing] of Object.entries(service.requirements.standings))
                {
                    if (pmcData.TradersInfo[standingTrader].standing < standing)
                    {
                        servicesToDelete.push(service.serviceType);
                        break;
                    }
                }
            }

            if (service.requirements?.completedQuests)
            {
                for (const questId of service.requirements.completedQuests)
                {
                    const quest = pmcData.Quests.find((x) => x.qid === questId);
                    if (!quest || quest.status !== QuestStatus.Success)
                    {
                        servicesToDelete.push(service.serviceType);
                        break;
                    }
                }
            }
        }

        // Clear any unavailable services from the list
        traderServices = traderServices.filter((x) => !servicesToDelete.includes(x.serviceType));

        return traderServices;
    }
}
