import { inject, injectable } from "tsyringe";
import { HideoutController } from "@spt/controllers/HideoutController";
import { RagfairController } from "@spt/controllers/RagfairController";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import { IGlobals } from "@spt/models/eft/common/IGlobals";
import { ICustomizationItem } from "@spt/models/eft/common/tables/ICustomizationItem";
import { IHandbookBase } from "@spt/models/eft/common/tables/IHandbookBase";
import { IGetItemPricesResponse } from "@spt/models/eft/game/IGetItemPricesResponse";
import { IHideoutArea } from "@spt/models/eft/hideout/IHideoutArea";
import { IHideoutProduction } from "@spt/models/eft/hideout/IHideoutProduction";
import { IHideoutScavCase } from "@spt/models/eft/hideout/IHideoutScavCase";
import { IHideoutSettingsBase } from "@spt/models/eft/hideout/IHideoutSettingsBase";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { Money } from "@spt/models/enums/Money";
import { ISettingsBase } from "@spt/models/spt/server/ISettingsBase";
import { DatabaseService } from "@spt/services/DatabaseService";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";

/**
 * Handle client requests
 */
@injectable()
export class DataCallbacks
{
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("DatabaseService") protected databaseService: DatabaseService,
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
        return this.httpResponse.getBody(this.databaseService.getSettings());
    }

    /**
     * Handle client/globals
     * @returns IGlobals
     */
    public getGlobals(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IGlobals>
    {
        const globals = this.databaseService.getGlobals();
        globals.time = Date.now() / 1000;

        return this.httpResponse.getBody(this.databaseService.getGlobals());
    }

    /**
     * Handle client/items
     * @returns string
     */
    public getTemplateItems(url: string, info: IEmptyRequestData, sessionID: string): string
    {
        return this.httpResponse.getUnclearedBody(this.databaseService.getItems());
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
        return this.httpResponse.getBody(this.databaseService.getHandbook());
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
        return this.httpResponse.getBody(this.databaseService.getTemplates().customization);
    }

    /**
     * Handle client/account/customization
     * @returns string[]
     */
    public getTemplateCharacter(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<string[]>
    {
        return this.httpResponse.getBody(this.databaseService.getTemplates().character);
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
        return this.httpResponse.getBody(this.databaseService.getHideout().settings);
    }

    public getHideoutAreas(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IHideoutArea[]>
    {
        return this.httpResponse.getBody(this.databaseService.getHideout().areas);
    }

    public gethideoutProduction(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IHideoutProduction[]>
    {
        return this.httpResponse.getBody(this.databaseService.getHideout().production);
    }

    public getHideoutScavcase(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IHideoutScavCase[]>
    {
        return this.httpResponse.getBody(this.databaseService.getHideout().scavcase);
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
        return this.httpResponse.getBody(this.databaseService.getLocales().languages);
    }

    /**
     * Handle client/menu/locale
     */
    public getLocalesMenu(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<string>
    {
        const localeId = url.replace("/client/menu/locale/", "");
        const locales = this.databaseService.getLocales();
        let result = locales.menu[localeId];

        if (result === undefined)
        {
            result = locales.menu.en;
        }

        if (result === undefined)
            throw new Error(`Unable to determine locale for request with '${localeId}'`);

        return this.httpResponse.getBody(result);
    }

    /**
     * Handle client/locale
     */
    public getLocalesGlobal(url: string, info: IEmptyRequestData, sessionID: string): string
    {
        const localeId = url.replace("/client/locale/", "");
        const locales = this.databaseService.getLocales();
        let result = locales.global[localeId];

        if (result === undefined)
        {
            result = locales.global["en"];
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
        const traderId = url.replace("/client/items/prices/", "");

        // All traders share same item prices, unknown how to tell what items are shown for each trader
        // Shown items listed are likely linked to traders items_buy/category array
        const handbookPrices = this.ragfairController.getStaticPrices();

        const response: IGetItemPricesResponse
        = {
            supplyNextTime: this.traderHelper.getNextUpdateTimestamp(traderId),
            prices: handbookPrices,
            currencyCourses: {
                "5449016a4bdc2d6f028b456f": handbookPrices[Money.ROUBLES],
                "569668774bdc2da2298b4568": handbookPrices[Money.EUROS],
                "5696686a4bdc2da3298b456a": handbookPrices[Money.DOLLARS],
            },
        };

        return this.httpResponse.getBody(response);
    }
}
