import { IBaseRepairActionDataRequest } from "@spt-aki/models/eft/repair/IBaseRepairActionDataRequest";

export interface IRepairActionDataRequest extends IBaseRepairActionDataRequest
{
    Action: "Repair";
    repairKitsInfo: RepairKitsInfo[];
    target: string; // item to repair
}

export interface RepairKitsInfo
{
    _id: string; // id of repair kit to use
    count: number; // amout of units to reduce kit by
}
