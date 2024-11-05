import { IBaseInteractionRequestData } from "@spt/models/eft/common/request/IBaseInteractionRequestData";
import { IItemLocation } from "@spt/models/eft/common/tables/IItem";

export interface IInventoryBaseActionRequestData extends IBaseInteractionRequestData {}

export interface ITo {
    id: string;
    container: string;
    location?: IItemLocation | number; // Hack
    isSearched?: boolean;
}

export interface IContainer {
    id: string;
    container: string;
    location?: ILocation | number; // Hack - BSG data object shows it as Location only
}

export interface ILocation {
    x: number;
    y: number;
    r: string;
    rotation?: string;
    isSearched: boolean;
}
