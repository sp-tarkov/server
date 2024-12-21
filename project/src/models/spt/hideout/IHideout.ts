import type { IHideoutArea } from "@spt/models/eft/hideout/IHideoutArea";
import type { IHideoutProductionData } from "@spt/models/eft/hideout/IHideoutProduction";
import type { IHideoutSettingsBase } from "@spt/models/eft/hideout/IHideoutSettingsBase";
import type { IQteData } from "@spt/models/eft/hideout/IQteData";

export interface IHideout {
    areas: IHideoutArea[];
    production: IHideoutProductionData;
    settings: IHideoutSettingsBase;
    qte: IQteData[];
}
