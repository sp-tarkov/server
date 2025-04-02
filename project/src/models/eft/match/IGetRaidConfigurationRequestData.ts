import { IRaidSettings } from "@spt/models/eft/match/IRaidSettings";

export interface IGetRaidConfigurationRequestData extends IRaidSettings {
    onlinePveRaidStates: Record<string, boolean>;
    transitionType: number;
    MaxGroupCount: number;
}
