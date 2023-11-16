import { Item, Location } from "@spt-aki/models/eft/common/tables/IItem";

export interface IAddItemTempObject
{
    itemRef: Item;
    count: number;
    isPreset: boolean;
    location?: Location;
    // Container item will be placed in - stash or sorting table
    containerId?: string;
}
