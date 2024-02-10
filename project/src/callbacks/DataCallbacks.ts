import { inject, injectable } from "tsyringe";

import { HideoutController } from "@spt-aki/controllers/HideoutController";
import { RagfairController } from "@spt-aki/controllers/RagfairController";
import { IEmptyRequestData } from "@spt-aki/models/eft/common/IEmptyRequestData";
import { IGlobals } from "@spt-aki/models/eft/common/IGlobals";
import { ICustomizationItem } from "@spt-aki/models/eft/common/tables/ICustomizationItem";
import { IHandbookBase } from "@spt-aki/models/eft/common/tables/IHandbookBase";
import { IGetItemPricesResponse } from "@spt-aki/models/eft/game/IGetItemPricesResponse";
import { IHideoutArea } from "@spt-aki/models/eft/hideout/IHideoutArea";
import { IHideoutProduction } from "@spt-aki/models/eft/hideout/IHideoutProduction";
import { IHideoutScavCase } from "@spt-aki/models/eft/hideout/IHideoutScavCase";
import { IHideoutSettingsBase } from "@spt-aki/models/eft/hideout/IHideoutSettingsBase";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";
import { Money } from "@spt-aki/models/enums/Money";
import { ISettingsBase } from "@spt-aki/models/spt/server/ISettingsBase";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";

/**
 * Handle client requests
 */
@injectable()
export class DataCallbacks
{
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("RagfairController") protected ragfairController: RagfairController,
        @inject("HideoutController") protected hideoutController: HideoutController,
    )
    {}

    /**
     * Handle client/settings
     * @returns ISettingsBase
     */
    public getSettings(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<ISettingsBase>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().settings);
    }

    /**
     * Handle client/globals
     * @returns IGlobals
     */
    public getGlobals(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IGlobals>
    {
        this.databaseServer.getTables().globals.time = Date.now() / 1000;
        return this.httpResponse.getBody(this.databaseServer.getTables().globals);
    }

    /**
     * Handle client/items
     * @returns string
     */
    public getTemplateItems(url: string, info: IEmptyRequestData, sessionID: string): string
    {
        return this.httpResponse.getUnclearedBody(this.databaseServer.getTables().templates.items);
    }

    /**
     * Handle client/handbook/templates
     * @returns IHandbookBase
     */
    public getTemplateHandbook(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IHandbookBase>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().templates.handbook);
    }

    /**
     * Handle client/customization
     * @returns Record<string, ICustomizationItem
     */
    public getTemplateSuits(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<Record<string, ICustomizationItem>>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().templates.customization);
    }

    /**
     * Handle client/account/customization
     * @returns string[]
     */
    public getTemplateCharacter(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<string[]>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().templates.character);
    }

    /**
     * Handle client/hideout/settings
     * @returns IHideoutSettingsBase
     */
    public getHideoutSettings(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IHideoutSettingsBase>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().hideout.settings);
    }

    public getHideoutAreas(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IHideoutArea[]>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().hideout.areas);
    }

    public gethideoutProduction(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IHideoutProduction[]>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().hideout.production);
    }

    public getHideoutScavcase(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IHideoutScavCase[]>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().hideout.scavcase);
    }

    /**
     * Handle client/languages
     */
    public getLocalesLanguages(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<Record<string, string>>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().locales.languages);
    }

    /**
     * Handle client/menu/locale
     */
    public getLocalesMenu(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<string>
    {
        const localeId = url.replace("/client/menu/locale/", "");
        const tables = this.databaseServer.getTables();
        let result = tables.locales.menu[localeId];

        if (result === undefined)
        {
            result = tables.locales.menu.en;
        }

        return this.httpResponse.getBody(result);
    }

    /**
     * Handle client/locale
     */
    public getLocalesGlobal(url: string, info: IEmptyRequestData, sessionID: string): string
    {
        const localeId = url.replace("/client/locale/", "");
        const tables = this.databaseServer.getTables();
        let result = tables.locales.global[localeId];

        if (result === undefined)
        {
            result = tables.locales.global[localeId];
        }

        return this.httpResponse.getUnclearedBody(result);
    }

    /**
     * Handle client/hideout/qte/list
     */
    public getQteList(url: string, info: IEmptyRequestData, sessionID: string): string
    {
        return this.httpResponse.getUnclearedBody(this.hideoutController.getQteList(sessionID));
    }

    /**
     * Handle client/items/prices/
     * Called when viewing a traders assorts
     * TODO -  fully implement this
     */
    public getItemPrices(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IGetItemPricesResponse>
    {
        const handbookPrices = this.ragfairController.getStaticPrices();
        const response: IGetItemPricesResponse = {
            supplyNextTime: 1672236024, // todo: get trader refresh time?
            prices: handbookPrices,
            currencyCourses: {
                /* eslint-disable @typescript-eslint/naming-convention */
                "5449016a4bdc2d6f028b456f": handbookPrices[Money.ROUBLES],
                "569668774bdc2da2298b4568": handbookPrices[Money.EUROS],
                "5696686a4bdc2da3298b456a": handbookPrices[Money.DOLLARS],
                /* eslint-enable @typescript-eslint/naming-convention */
            },
        };
        return this.httpResponse.getBody(response);
    }
}
