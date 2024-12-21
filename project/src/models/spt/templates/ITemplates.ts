import type { IAchievement } from "@spt/models/eft/common/tables/IAchievement";
import type { ICustomizationItem } from "@spt/models/eft/common/tables/ICustomizationItem";
import type { IHandbookBase } from "@spt/models/eft/common/tables/IHandbookBase";
import type { ILocationServices } from "@spt/models/eft/common/tables/ILocationServices";
import type { IProfileTemplates } from "@spt/models/eft/common/tables/IProfileTemplate";
import type { IQuest } from "@spt/models/eft/common/tables/IQuest";
import type { IRepeatableQuestDatabase } from "@spt/models/eft/common/tables/IRepeatableQuests";
import type { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import type { IDefaultEquipmentPreset } from "@spt/models/eft/profile/ISptProfile";

export interface ITemplates {
    character: string[];
    items: Record<string, ITemplateItem>;
    quests: Record<string, IQuest>;
    repeatableQuests: IRepeatableQuestDatabase;
    handbook: IHandbookBase;
    customization: Record<string, ICustomizationItem>;

    /** The profile templates listed in the launcher on profile creation, split by account type (e.g. Standard) then side (e.g. bear/usec) */
    profiles: IProfileTemplates;

    /** Flea prices of items - gathered from online flea market dump */
    prices: Record<string, number>;

    /** Default equipment loadouts that show on main inventory screen */
    defaultEquipmentPresets: IDefaultEquipmentPreset[];

    /** Achievements */
    achievements: IAchievement[];

    /** Location services data */
    locationServices: ILocationServices;
}
