import { IGlobals } from "@spt/models/eft/common/IGlobals";
import { ILocation } from "@spt/models/eft/common/ILocation";
import { IAchievement } from "@spt/models/eft/common/tables/IAchievement";
import { ICustomizationItem } from "@spt/models/eft/common/tables/ICustomizationItem";
import { IHandbookBase } from "@spt/models/eft/common/tables/IHandbookBase";
import { ILocationServices } from "@spt/models/eft/common/tables/ILocationServices";
import { IMatch } from "@spt/models/eft/common/tables/IMatch";
import { IProfileTemplates } from "@spt/models/eft/common/tables/IProfileTemplate";
import { IQuest } from "@spt/models/eft/common/tables/IQuest";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { ITrader } from "@spt/models/eft/common/tables/ITrader";
import { IBots } from "@spt/models/spt/bots/IBots";
import { ILocationConfig } from "@spt/models/spt/config/ILocationConfig";
import { IHideout } from "@spt/models/spt/hideout/IHideout";
import { IDatabaseTables } from "@spt/models/spt/server/IDatabaseTables";
import { ILocaleBase } from "@spt/models/spt/server/ILocaleBase";
import { ILocations } from "@spt/models/spt/server/ILocations";
import { IServerBase } from "@spt/models/spt/server/IServerBase";
import { ISettingsBase } from "@spt/models/spt/server/ISettingsBase";
import { ITemplates } from "@spt/models/spt/templates/ITemplates";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HashUtil } from "@spt/utils/HashUtil";
import { Timer } from "@spt/utils/Timer";
import { inject, injectable } from "tsyringe";

@injectable()
export class DatabaseService {
    protected locationConfig: ILocationConfig;
    protected isDataValid: boolean;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("HashUtil") protected hashUtil: HashUtil,
    ) {}

    /**
     * @returns assets/database/
     */
    public getTables(): IDatabaseTables {
        return this.databaseServer.getTables();
    }

    /**
     * @returns assets/database/bots/
     */
    public getBots(): IBots {
        if (!this.databaseServer.getTables().bots) {
            throw new Error(this.localisationService.getText("database-data_at_path_missing", "assets/database/bots"));
        }

        return this.databaseServer.getTables().bots;
    }

    /**
     * @returns assets/database/globals.json
     */
    public getGlobals(): IGlobals {
        if (!this.databaseServer.getTables().globals) {
            throw new Error(
                this.localisationService.getText("database-data_at_path_missing", "assets/database/globals.json"),
            );
        }

        return this.databaseServer.getTables().globals;
    }

    /**
     * @returns assets/database/hideout/
     */
    public getHideout(): IHideout {
        if (!this.databaseServer.getTables().hideout) {
            throw new Error(
                this.localisationService.getText("database-data_at_path_missing", "assets/database/hideout"),
            );
        }

        return this.databaseServer.getTables().hideout;
    }

    /**
     * @returns assets/database/locales/
     */
    public getLocales(): ILocaleBase {
        if (!this.databaseServer.getTables().locales) {
            throw new Error(
                this.localisationService.getText("database-data_at_path_missing", "assets/database/locales"),
            );
        }

        return this.databaseServer.getTables().locales;
    }

    /**
     * @returns assets/database/locations
     */
    public getLocations(): ILocations {
        if (!this.databaseServer.getTables().locations) {
            throw new Error(
                this.localisationService.getText("database-data_at_path_missing", "assets/database/locales"),
            );
        }

        return this.databaseServer.getTables().locations;
    }

    /**
     * Get specific location by its Id
     * @param locationId Desired location id
     * @returns assets/database/locations/
     */
    public getLocation(locationId: string): ILocation {
        const locations = this.getLocations();
        const desiredLocation = locations[locationId.toLowerCase()];
        if (!desiredLocation) {
            throw new Error(this.localisationService.getText("database-no_location_found_with_id", locationId));
        }

        return desiredLocation;
    }

    /**
     * @returns assets/database/match/
     */
    public getMatch(): IMatch {
        if (!this.databaseServer.getTables().match) {
            throw new Error(
                this.localisationService.getText("database-data_at_path_missing", "assets/database/locales"),
            );
        }

        return this.databaseServer.getTables().match;
    }

    /**
     * @returns assets/database/server.json
     */
    public getServer(): IServerBase {
        if (!this.databaseServer.getTables().server) {
            throw new Error(
                this.localisationService.getText("database-data_at_path_missing", "assets/database/server.json"),
            );
        }

        return this.databaseServer.getTables().server;
    }

    /**
     * @returns assets/database/settings.json
     */
    public getSettings(): ISettingsBase {
        if (!this.databaseServer.getTables().settings) {
            throw new Error(
                this.localisationService.getText("database-data_at_path_missing", "assets/database/settings.json"),
            );
        }

        return this.databaseServer.getTables().settings;
    }

    /**
     * @returns assets/database/templates/
     */
    public getTemplates(): ITemplates {
        if (!this.databaseServer.getTables().templates) {
            throw new Error(
                this.localisationService.getText("database-data_at_path_missing", "assets/database/templates"),
            );
        }

        return this.databaseServer.getTables().templates;
    }

    /**
     * @returns assets/database/templates/achievements.json
     */
    public getAchievements(): IAchievement[] {
        if (!this.databaseServer.getTables().templates.achievements) {
            throw new Error(
                this.localisationService.getText(
                    "database-data_at_path_missing",
                    "assets/database/templates/achievements.json",
                ),
            );
        }

        return this.databaseServer.getTables().templates.achievements;
    }

    /**
     * @returns assets/database/templates/customisation.json
     */
    public getCustomization(): Record<string, ICustomizationItem> {
        if (!this.databaseServer.getTables().templates.customization) {
            throw new Error(
                this.localisationService.getText(
                    "database-data_at_path_missing",
                    "assets/database/templates/customization.json",
                ),
            );
        }

        return this.databaseServer.getTables().templates.customization;
    }

    /**
     * @returns assets/database/templates/handbook.json
     */
    public getHandbook(): IHandbookBase {
        if (!this.databaseServer.getTables().templates.handbook) {
            throw new Error(
                this.localisationService.getText(
                    "database-data_at_path_missing",
                    "assets/database/templates/handbook.json",
                ),
            );
        }

        return this.databaseServer.getTables().templates.handbook;
    }

    /**
     * @returns assets/database/templates/items.json
     */
    public getItems(): Record<string, ITemplateItem> {
        if (!this.databaseServer.getTables().templates.items) {
            throw new Error(
                this.localisationService.getText(
                    "database-data_at_path_missing",
                    "assets/database/templates/items.json",
                ),
            );
        }

        return this.databaseServer.getTables().templates.items;
    }

    /**
     * @returns assets/database/templates/prices.json
     */
    public getPrices(): Record<string, number> {
        if (!this.databaseServer.getTables().templates.prices) {
            throw new Error(
                this.localisationService.getText(
                    "database-data_at_path_missing",
                    "assets/database/templates/prices.json",
                ),
            );
        }

        return this.databaseServer.getTables().templates.prices;
    }

    /**
     * @returns assets/database/templates/profiles.json
     */
    public getProfiles(): IProfileTemplates {
        if (!this.databaseServer.getTables().templates.profiles) {
            throw new Error(
                this.localisationService.getText(
                    "database-data_at_path_missing",
                    "assets/database/templates/profiles.json",
                ),
            );
        }

        return this.databaseServer.getTables().templates.profiles;
    }

    /**
     * @returns assets/database/templates/quests.json
     */
    public getQuests(): Record<string, IQuest> {
        if (!this.databaseServer.getTables().templates.quests) {
            throw new Error(
                this.localisationService.getText(
                    "database-data_at_path_missing",
                    "assets/database/templates/quests.json",
                ),
            );
        }

        return this.databaseServer.getTables().templates.quests;
    }

    /**
     * @returns assets/database/traders/
     */
    public getTraders(): Record<string, ITrader> {
        if (!this.databaseServer.getTables().traders) {
            throw new Error(
                this.localisationService.getText("database-data_at_path_missing", "assets/database/traders"),
            );
        }

        return this.databaseServer.getTables().traders;
    }

    /**
     * Get specific trader by their Id
     * @param traderId Desired trader id
     * @returns assets/database/traders/
     */
    public getTrader(traderId: string): ITrader {
        const traders = this.getTraders();
        const desiredTrader = traders[traderId];
        if (!desiredTrader) {
            throw new Error(this.localisationService.getText("database-no_trader_found_with_id", traderId));
        }

        return desiredTrader;
    }

    /**
     * @returns assets/database/locationServices/
     */
    public getLocationServices(): ILocationServices {
        if (!this.databaseServer.getTables().templates.locationServices) {
            throw new Error(
                this.localisationService.getText(
                    "database-data_at_path_missing",
                    "assets/database/locationServices.json",
                ),
            );
        }

        return this.databaseServer.getTables().templates.locationServices;
    }

    /**
     * Validates that the database doesn't contain invalid ID data
     */
    public validateDatabase(): void {
        const timer = new Timer();
        this.isDataValid =
            this.validateTable(this.getQuests(), "quest") &&
            this.validateTable(this.getTraders(), "trader") &&
            this.validateTable(this.getItems(), "item") &&
            this.validateTable(this.getCustomization(), "customization");

        if (!this.isDataValid) {
            this.logger.error(this.localisationService.getText("database-invalid_data"));
        }

        this.logger.debug(`Database ID validation took ${timer.getTime("ms")}ms`);
    }

    /**
     * Validate that the given table only contains valid MongoIDs
     * @param table Table to validate for MongoIDs
     * @param tableType The type of table, used in output message
     * @returns True if the table only contains valid data
     */
    private validateTable(table: Record<string, any>, tableType: string): boolean {
        for (const tableId in table) {
            if (!this.hashUtil.isValidMongoId(tableId)) {
                this.logger.error(`Invalid ${tableType} ID: '${tableId}'`);
                return false;
            }
        }

        return true;
    }

    /**
     * Check if the database is valid
     * @returns True if the database contains valid data, false otherwise
     */
    public isDatabaseValid(): boolean {
        return this.isDataValid;
    }
}
