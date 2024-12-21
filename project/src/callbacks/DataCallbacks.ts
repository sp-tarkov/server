import { HideoutController } from "@spt/controllers/HideoutController";
import { TraderController } from "@spt/controllers/TraderController";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import type { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import type { IGlobals } from "@spt/models/eft/common/IGlobals";
import type { ICustomizationItem } from "@spt/models/eft/common/tables/ICustomizationItem";
import type { IHandbookBase } from "@spt/models/eft/common/tables/IHandbookBase";
import type { IGetItemPricesResponse } from "@spt/models/eft/game/IGetItemPricesResponse";
import type { IHideoutArea } from "@spt/models/eft/hideout/IHideoutArea";
import type { IHideoutProductionData } from "@spt/models/eft/hideout/IHideoutProduction";
import type { IHideoutSettingsBase } from "@spt/models/eft/hideout/IHideoutSettingsBase";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import type { ISettingsBase } from "@spt/models/spt/server/ISettingsBase";
import { DatabaseService } from "@spt/services/DatabaseService";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { inject, injectable } from "tsyringe";

/**
 * Handle client requests
 */
@injectable()
export class DataCallbacks {
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("TraderController") protected traderController: TraderController,
        @inject("HideoutController") protected hideoutController: HideoutController,
    ) {}

    /**
     * Handle client/settings
     * @returns ISettingsBase
     */
    public getSettings(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<ISettingsBase> {
        return this.httpResponse.getBody(this.databaseService.getSettings());
    }

    /**
     * Handle client/globals
     * @returns IGlobals
     */
    public getGlobals(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IGlobals> {
        const globals = this.databaseService.getGlobals();
        globals.time = Date.now() / 1000;

        return this.httpResponse.getBody(this.databaseService.getGlobals());
    }

    /**
     * Handle client/items
     * @returns string
     */
    public getTemplateItems(url: string, info: IEmptyRequestData, sessionID: string): string {
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
    ): IGetBodyResponseData<IHandbookBase> {
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
    ): IGetBodyResponseData<Record<string, ICustomizationItem>> {
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
    ): IGetBodyResponseData<string[]> {
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
    ): IGetBodyResponseData<IHideoutSettingsBase> {
        return this.httpResponse.getBody(this.databaseService.getHideout().settings);
    }

    public getHideoutAreas(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IHideoutArea[]> {
        return this.httpResponse.getBody(this.databaseService.getHideout().areas);
    }

    public getHideoutProduction(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IHideoutProductionData> {
        return this.httpResponse.getBody(this.databaseService.getHideout().production);
    }

    /**
     * Handle client/languages
     */
    public getLocalesLanguages(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<Record<string, string>> {
        return this.httpResponse.getBody(this.databaseService.getLocales().languages);
    }

    /**
     * Handle client/menu/locale
     */
    public getLocalesMenu(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<string> {
        const localeId = url.replace("/client/menu/locale/", "");
        const locales = this.databaseService.getLocales();
        let result = locales.menu[localeId];

        if (result === undefined) {
            result = locales.menu.en;
        }

        if (result === undefined) throw new Error(`Unable to determine locale for request with '${localeId}'`);

        return this.httpResponse.getBody(result);
    }

    /**
     * Handle client/locale
     */
    public getLocalesGlobal(url: string, info: IEmptyRequestData, sessionID: string): string {
        const localeId = url.replace("/client/locale/", "");
        const locales = this.databaseService.getLocales();
        let result = locales.global[localeId];

        if (result === undefined) {
            result = locales.global.en;
        }

        return this.httpResponse.getUnclearedBody(result);
    }

    /**
     * Handle client/hideout/qte/list
     */
    public getQteList(url: string, info: IEmptyRequestData, sessionID: string): string {
        return this.httpResponse.getUnclearedBody(this.hideoutController.getQteList(sessionID));
    }

    /**
     * Handle client/items/prices/
     * Called when viewing a traders assorts
     */
    public getItemPrices(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IGetItemPricesResponse> {
        const traderId = url.replace("/client/items/prices/", "");

        return this.httpResponse.getBody(this.traderController.getItemPrices(sessionID, traderId));
    }
}
