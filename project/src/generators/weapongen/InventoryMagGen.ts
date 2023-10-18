import { Inventory } from "@spt-aki/models/eft/common/tables/IBotBase";
import { GenerationData } from "@spt-aki/models/eft/common/tables/IBotType";
import { ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";

export class InventoryMagGen 
{
    constructor(
        private magCounts: GenerationData,
        private magazineTemplate: ITemplateItem,
        private weaponTemplate: ITemplateItem,
        private ammoTemplate: ITemplateItem,
        private pmcInventory: Inventory
    ) 
    {
    }

    public getMagCount(): GenerationData 
    {
        return this.magCounts;
    }

    public getMagazineTemplate(): ITemplateItem 
    {
        return this.magazineTemplate;
    }

    public getWeaponTemplate(): ITemplateItem 
    {
        return this.weaponTemplate;
    }

    public getAmmoTemplate(): ITemplateItem 
    {
        return this.ammoTemplate;
    }

    public getPmcInventory(): Inventory 
    {
        return this.pmcInventory;
    }
}