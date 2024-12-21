import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { Money } from "@spt/models/enums/Money";
import type { IInventoryConfig } from "@spt/models/spt/config/IInventoryConfig";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { inject, injectable } from "tsyringe";

@injectable()
export class PaymentHelper {
    protected inventoryConfig: IInventoryConfig;

    constructor(@inject("ConfigServer") protected configServer: ConfigServer) {
        this.inventoryConfig = this.configServer.getConfig(ConfigTypes.INVENTORY);
    }

    /**
     * Is the passed in tpl money (also checks custom currencies in inventoryConfig.customMoneyTpls)
     * @param {string} tpl
     * @returns void
     */
    public isMoneyTpl(tpl: string): boolean {
        return [Money.DOLLARS, Money.EUROS, Money.ROUBLES, Money.GP, ...this.inventoryConfig.customMoneyTpls].some(
            (element) => element === tpl,
        );
    }

    /**
     * Gets currency TPL from TAG
     * @param {string} currency
     * @returns string
     */
    public getCurrency(currency: string): string {
        switch (currency) {
            case "EUR":
                return Money.EUROS;
            case "USD":
                return Money.DOLLARS;
            case "RUB":
                return Money.ROUBLES;
            case "GP":
                return Money.GP;
            default:
                return "";
        }
    }
}
