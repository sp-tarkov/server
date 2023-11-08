import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { Dialogue, IUserBuilds } from "@spt-aki/models/eft/profile/IAkiProfile";

export interface IProfileTemplates {
    Standard: IProfileSides;
    "Left Behind": IProfileSides;
    "Prepare To Escape": IProfileSides;
    "Edge Of Darkness": IProfileSides;
}

export interface IProfileSides {
    usec: TemplateSide;
    bear: TemplateSide;
}

export interface TemplateSide {
    character: IPmcData;
    suits: string[];
    dialogues: Record<string, Dialogue>;
    userbuilds: IUserBuilds;
    trader: ProfileTraderTemplate;
}

export interface ProfileTraderTemplate {
    initialLoyaltyLevel: number;
    setQuestsAvailableForStart?: boolean;
    setQuestsAvailableForFinish?: boolean;
    initialStanding: number;
    initialSalesSum: number;
    jaegerUnlocked: boolean;
}
