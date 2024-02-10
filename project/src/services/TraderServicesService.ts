import { ITraderServiceModel } from "@spt-aki/models/spt/services/ITraderServiceModel";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { inject, injectable } from "tsyringe";

@injectable()
export class TraderServicesService
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
    )
    {}

    public getTraderServices(traderId: string): ITraderServiceModel[]
    {
        const traderServices = this.databaseServer.getTables().traders[traderId]?.services;
        return traderServices ?? [];
    }
}
