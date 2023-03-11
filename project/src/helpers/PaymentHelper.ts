import { inject, injectable } from "tsyringe";

import { ConfigTypes } from "../models/enums/ConfigTypes";
import { Money } from "../models/enums/Money";
import { IInventoryConfig } from "../models/spt/config/IInventoryConfig";
import { ConfigServer } from "../servers/ConfigServer";

@injectable()
export class PaymentHelper
{
    protected inventoryConfig: IInventoryConfig;

    constructor(
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.inventoryConfig = this.configServer.getConfig(ConfigTypes.INVENTORY);
    }

    /**
     * Is the passed in tpl money (also checks custom currencies in inventoryConfig.customMoneyTpls)
     * @param {string} tpl
     * @returns void
     */
    public isMoneyTpl(tpl: string): boolean
    {
        return [Money.DOLLARS, Money.EUROS, Money.ROUBLES, ...this.inventoryConfig.customMoneyTpls].some(element => element === tpl);
    }

    /**
    * Gets currency TPL from TAG
    * @param {string} currency
    * @returns string
    */
    public getCurrency(currency: string): string
    {
        switch (currency)
        {
            case "EUR":
                return Money.EUROS;
            case "USD":
                return Money.DOLLARS;
            case "RUB":
                return Money.ROUBLES;
            default:
                return "";
        }
    }
}