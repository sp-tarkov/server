import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { Dialogue, IUserBuilds } from "@spt-aki/models/eft/profile/IAkiProfile";

export interface IProfileTemplates
{
    Standard: IProfileSides;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "Left Behind": IProfileSides;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "Prepare To Escape": IProfileSides;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "Edge Of Darkness": IProfileSides;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "SPT Developer": IProfileSides;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "SPT Easy start": IProfileSides;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "SPT Zero to hero": IProfileSides;
}

export interface IProfileSides
{
    descriptionLocaleKey: string;
    usec: TemplateSide;
    bear: TemplateSide;
}

export interface TemplateSide
{
    character: IPmcData;
    suits: string[];
    dialogues: Record<string, Dialogue>;
    userbuilds: IUserBuilds;
    trader: ProfileTraderTemplate;
}

export interface ProfileTraderTemplate
{
    initialLoyaltyLevel: number;
    setQuestsAvailableForStart?: boolean;
    setQuestsAvailableForFinish?: boolean;
    initialStanding: number;
    initialSalesSum: number;
    jaegerUnlocked: boolean;
}
