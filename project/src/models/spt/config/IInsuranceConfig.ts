import { IBaseConfig } from "@spt/models/spt/config/IBaseConfig";

export interface IInsuranceConfig extends IBaseConfig {
    kind: "spt-insurance";
    /** Chance item is returned as insurance, keyed by trader id */
    returnChancePercent: Record<string, number>;
    /** Item slots that should never be returned as insurance */
    blacklistedEquipment: string[];
    /** Some slots should always be removed, e.g. 'cartridges' */
    slotIdsToAlwaysRemove: string[];
    /** Override to control how quickly insurance is processed/returned in seconds */
    returnTimeOverrideSeconds: number;
    /** Override to control how long insurance returns stay in mail before expiring - in seconds */
    storageTimeOverrideSeconds: number;
    /** How often server should process insurance in seconds */
    runIntervalSeconds: number;
    // Lowest rouble price for an attachment to be allowed to be taken
    minAttachmentRoublePriceToBeTaken: number;
    // Chance out of 100% no attachments from a parent are taken
    chanceNoAttachmentsTakenPercent: number;
    simulateItemsBeingTaken: boolean;
}
