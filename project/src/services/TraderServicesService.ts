import { inject, injectable } from "tsyringe";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { QuestStatus } from "@spt-aki/models/enums/QuestStatus";
import { ITraderServiceModel } from "@spt-aki/models/spt/services/ITraderServiceModel";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ICloner } from "@spt-aki/utils/cloners/ICloner";

@injectable()
export class TraderServicesService
{
    constructor(
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("RecursiveCloner") protected cloner: ICloner,
    )
    {}

    public getTraderServices(sessionId: string, traderId: string): ITraderServiceModel[]
    {
        const pmcData = this.profileHelper.getPmcProfile(sessionId);
        let traderServices = this.cloner.clone(this.databaseServer.getTables().traders[traderId]?.services);
        if (!traderServices)
        {
            return [];
        }

        // Filter out any service the user doesn't meet the conditions for
        const servicesToDelete = [];
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
