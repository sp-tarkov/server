import path from "node:path";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { LocaleService } from "@spt/services/LocaleService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { I18n } from "i18n";
import { inject, injectable } from "tsyringe";

/**
 * Handles translating server text into different langauges
 */
@injectable()
export class LocalisationService {
    protected i18n: I18n;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("LocaleService") protected localeService: LocaleService,
    ) {
        const localeFileDirectory = path.join(
            process.cwd(),
            globalThis.G_RELEASE_CONFIGURATION
                ? "SPT_Data/Server/database/locales/server"
                : "./assets/database/locales/server",
        );
        this.i18n = new I18n({
            locales: this.localeService.getServerSupportedLocales(),
            fallbacks: this.localeService.getLocaleFallbacks(),
            defaultLocale: "en",
            directory: localeFileDirectory,
            retryInDefaultLocale: true,
        });

        this.i18n.setLocale(this.localeService.getDesiredServerLocale());
    }

    /**
     * Get a localised value using the passed in key
     * @param key Key to loop up locale for
     * @param args optional arguments
     * @returns Localised string
     */
    public getText(key: string, args?: any): string {
        return args === undefined ? this.i18n.__(key.toLowerCase()) : this.i18n.__(key.toLowerCase(), args);
    }

    /**
     * Get all locale keys
     * @returns string array of keys
     */
    public getKeys(): string[] {
        return Object.keys(this.databaseServer.getTables().locales.server.en);
    }

    /**
     * From the provided partial key, find all keys that start with text and choose a random match
     * @param partialKey Key to match locale keys on
     * @returns locale text
     */
    public getRandomTextThatMatchesPartialKey(partialKey: string): string {
        const filteredKeys = Object.keys(this.databaseServer.getTables().locales.server.en).filter((x) =>
            x.startsWith(partialKey),
        );
        const chosenKey = this.randomUtil.getArrayValue(filteredKeys);

        return this.getText(chosenKey);
    }
}
