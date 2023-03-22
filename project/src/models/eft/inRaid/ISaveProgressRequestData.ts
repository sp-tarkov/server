import { IPmcData } from "../common/IPmcData";
import { ISyncHealthRequestData } from "../health/ISyncHealthRequestData";

export interface ISaveProgressRequestData 
{
    exit: string // Survived" | "Killed" | "Left" | "runner" | "MissingInAction
    profile: IPmcData
    isPlayerScav: boolean
    health: ISyncHealthRequestData
}