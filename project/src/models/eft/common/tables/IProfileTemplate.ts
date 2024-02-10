import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { Dialogue, IUserBuilds } from "@spt-aki/models/eft/profile/IAkiProfile";

export interface IProfileTemplates
{
    /* eslint-disable @typescript-eslint/naming-convention */
    Standard: IProfileSides;
    "Left Behind": IProfileSides;
    "Prepare To Escape": IProfileSides;
    "Edge Of Darkness": IProfileSides;
    "SPT Developer": IProfileSides;
    "SPT Easy start": IProfileSides;
    "SPT Zero to hero": IProfileSides;
    /* eslint-enable @typescript-eslint/naming-convention */
}

export interface IProfileSides
{
    descriptionLocaleKey: string;
    usec: ITemplateSide;
    bear: ITemplateSide;
}

export interface ITemplateSide
{
    character: IPmcData;
    suits: string[];
    dialogues: Record<string, Dialogue>;
    userbuilds: IUserBuilds;
    trader: ProfileTraderTemplate;
}

export interface ProfileTraderTemplate
{
    initialLoyaltyLevel: Record<string, number>;
    setQuestsAvailableForStart?: boolean;
    setQuestsAvailableForFinish?: boolean;
    initialStanding: number;
    initialSalesSum: number;
    jaegerUnlocked: boolean;
}
