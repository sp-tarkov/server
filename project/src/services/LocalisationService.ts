import { I18n } from "i18n";
import { inject, injectable } from "tsyringe";

import { ILocaleConfig } from "../models/spt/config/ILocaleConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { LocaleService } from "./LocaleService";

/**
 * Handles translating server text into different langauges
 */
@injectable()
export class LocalisationService
{
    protected localeConfig: ILocaleConfig;
    protected i18n: I18n;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("LocaleService") protected localeService: LocaleService
    )
    {
        const localeFileDirectory = (globalThis.G_RELEASE_CONFIGURATION) ? "Aki_Data/Server/locales" : "./assets/locales";
        this.i18n = new I18n(
            {
                locales: this.localeService.getServerSupportedLocales(),
                defaultLocale: "en",
                directory: localeFileDirectory,
                retryInDefaultLocale: true
            }
        );

        this.i18n.setLocale(this.localeService.getDesiredServerLocale());
    }

    /**
     * Get a localised value using the passed in key
     * @param key Key to loop up locale for
     * @param args optional arguments
     * @returns Localised string
     */
    public getText(key: string, args = undefined): string
    {
        return this.i18n.__(key.toLowerCase(), args);
    }

    /**
     * Get all locale keys
     * @returns string array of keys
     */
    public getKeys(): string[]
    {
        return Object.keys(this.i18n.getCatalog("en"));
    }
}