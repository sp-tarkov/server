import { IBaseRepairActionDataRequest } from "@spt/models/eft/repair/IBaseRepairActionDataRequest";

export interface IRepairActionDataRequest extends IBaseRepairActionDataRequest {
    Action: "Repair";
    repairKitsInfo: IRepairKitsInfo[];
    target: string; // item to repair
}

export interface IRepairKitsInfo {
    _id: string; // id of repair kit to use
    count: number; // amout of units to reduce kit by
}
