import { TraderServiceType } from "@spt-aki/models/enums/TraderServiceType";

export interface ITraderServiceModel
{
    serviceType: TraderServiceType;
    itemsToPay?: {[key: string]: number};
    itemsToReceive?: string[];
    subServices?: {[key: string]: number};
}
