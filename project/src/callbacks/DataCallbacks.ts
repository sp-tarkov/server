import { inject, injectable } from "tsyringe";

import { HideoutController } from "../controllers/HideoutController";
import { RagfairController } from "../controllers/RagfairController";
import { IEmptyRequestData } from "../models/eft/common/IEmptyRequestData";
import { IGlobals } from "../models/eft/common/IGlobals";
import { ICustomizationItem } from "../models/eft/common/tables/ICustomizationItem";
import { IHandbookBase } from "../models/eft/common/tables/IHandbookBase";
import { IQuest } from "../models/eft/common/tables/IQuest";
import { IGetItemPricesResponse } from "../models/eft/game/IGetItemPricesResponse";
import { IHideoutArea } from "../models/eft/hideout/IHideoutArea";
import { IHideoutProduction } from "../models/eft/hideout/IHideoutProduction";
import { IHideoutScavCase } from "../models/eft/hideout/IHideoutScavCase";
import { IHideoutSettingsBase } from "../models/eft/hideout/IHideoutSettingsBase";
import { IGetBodyResponseData } from "../models/eft/httpResponse/IGetBodyResponseData";
import { Money } from "../models/enums/Money";
import { ISettingsBase } from "../models/spt/server/ISettingsBase";
import { DatabaseServer } from "../servers/DatabaseServer";
import { HttpResponseUtil } from "../utils/HttpResponseUtil";

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
        @inject("HideoutController") protected hideoutController: HideoutController
    )
    { }

    /**
     * Handles client/settings
     * @returns ISettingsBase
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getSettings(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<ISettingsBase>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().settings);
    }

    /**
     * Handles client/globals
     * @returns IGlobals
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getGlobals(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IGlobals>
    {
        this.databaseServer.getTables().globals.time = Date.now() / 1000;
        return this.httpResponse.getBody(this.databaseServer.getTables().globals);
    }

    /**
     * Handles client/items
     * @returns string
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getTemplateItems(url: string, info: IEmptyRequestData, sessionID: string): string
    {
        return this.httpResponse.getUnclearedBody(this.databaseServer.getTables().templates.items);
    }

    /**
     * Handles client/handbook/templates
     * @returns IHandbookBase
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getTemplateHandbook(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IHandbookBase>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().templates.handbook);
    }

    /**
     * Handles client/customization
     * @returns Record<string, ICustomizationItem
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getTemplateSuits(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<Record<string, ICustomizationItem>>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().templates.customization);
    }

    /**
     * Handles client/account/customization
     * @returns string[]
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getTemplateCharacter(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<string[]>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().templates.character);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getTemplateQuests(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IQuest[]>
    {
        return this.httpResponse.getBody(Object.values(this.databaseServer.getTables().templates.quests));
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getHideoutSettings(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IHideoutSettingsBase>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().hideout.settings);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getHideoutAreas(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IHideoutArea[]>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().hideout.areas);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public gethideoutProduction(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IHideoutProduction[]>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().hideout.production);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getHideoutScavcase(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IHideoutScavCase[]>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().hideout.scavcase);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getLocalesLanguages(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<Record<string, string>>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().locales.languages);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getLocalesMenu(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<string>
    {
        return this.httpResponse.getBody(this.databaseServer.getTables().locales.menu[url.replace("/client/menu/locale/", "")]);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getLocalesGlobal(url: string, info: IEmptyRequestData, sessionID: string): string
    {
        return this.httpResponse.getUnclearedBody(this.databaseServer.getTables().locales.global[url.replace("/client/locale/", "")]);
    }

    /**
     * Handle client/hideout/qte/list
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getQteList(url: string, info: IEmptyRequestData, sessionID: string): string
    {
        return this.httpResponse.getUnclearedBody(this.hideoutController.getQteList(sessionID));
    }

    /**
     * Handle client/items/prices/
     * Called when viewing a traders assorts
     * TODO -  fully implement this
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getItemPrices(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IGetItemPricesResponse>
    {
        const handbookPrices = this.ragfairController.getStaticPrices();
        const response: IGetItemPricesResponse = {
            supplyNextTime: 1672236024, // todo: get trader refresh time?
            prices: handbookPrices,
            currencyCourses: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "5449016a4bdc2d6f028b456f": handbookPrices[Money.ROUBLES],
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "569668774bdc2da2298b4568": handbookPrices[Money.EUROS],
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "5696686a4bdc2da3298b456a": handbookPrices[Money.DOLLARS]
            }
        };
        return this.httpResponse.getBody(response);
    }
}