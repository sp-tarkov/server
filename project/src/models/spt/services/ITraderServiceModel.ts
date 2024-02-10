import { TraderServiceType } from "@spt-aki/models/enums/TraderServiceType";

export interface ITraderServiceModel
{
    serviceType: TraderServiceType;
    itemsToPay?: Record<string, number>[];
    subServices?: Record<string, number>[];
}
