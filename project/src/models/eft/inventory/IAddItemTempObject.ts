import { IItem, IItemLocation } from "@spt/models/eft/common/tables/IItem";

export interface IAddItemTempObject {
    itemRef: IItem;
    count: number;
    isPreset: boolean;
    location?: IItemLocation;
    // Container item will be placed in - stash or sorting table
    containerId?: string;
}
