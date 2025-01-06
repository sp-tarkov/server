import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ILocaleConfig } from "@spt/models/spt/config/ILocaleConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { inject, injectable } from "tsyringe";

/**
 * Handles getting locales from config or users machine
 */
@injectable()
export class LocaleService {
    protected localeConfig: ILocaleConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.localeConfig = this.configServer.getConfig(ConfigTypes.LOCALE);
    }

    /**
     * Get the eft globals db file based on the configured locale in config/locale.json, if not found, fall back to 'en'
     * @returns dictionary
     */
    public getLocaleDb(): Record<string, string> {
        const desiredLocale = this.databaseServer.getTables().locales.global[this.getDesiredGameLocale()];
        if (desiredLocale) {
            return desiredLocale;
        }

        this.logger.warning(
            `Unable to find desired locale file using locale: ${this.getDesiredGameLocale()} from config/locale.json, falling back to 'en'`,
        );

        return this.databaseServer.getTables().locales.global.en;
    }

    /**
     * Gets the game locale key from the locale.json file,
     * if value is 'system' get system locale
     * @returns locale e.g en/ge/cz/cn
     */
    public getDesiredGameLocale(): string {
        if (this.localeConfig.gameLocale.toLowerCase() === "system") {
            return this.getPlatformForClientLocale();
        }

        return this.localeConfig.gameLocale.toLowerCase();
    }

    /**
     * Gets the game locale key from the locale.json file,
     * if value is 'system' get system locale
     * @returns locale e.g en/ge/cz/cn
     */
    public getDesiredServerLocale(): string {
        if (this.localeConfig.serverLocale.toLowerCase() === "system") {
            return this.getPlatformForServerLocale();
        }

        return this.localeConfig.serverLocale.toLowerCase();
    }

    /**
     * Get array of languages supported for localisation
     * @returns array of locales e.g. en/fr/cn
     */
    public getServerSupportedLocales(): string[] {
        return this.localeConfig.serverSupportedLocales;
    }

    /**
     * Get array of languages supported for localisation
     * @returns array of locales e.g. en/fr/cn
     */
    public getLocaleFallbacks(): { [locale: string]: string } {
        return this.localeConfig.fallbacks;
    }

    /**
     * Get the full locale of the computer running the server lowercased e.g. en-gb / pt-pt
     * @returns string
     */
    public getPlatformForServerLocale(): string {
        const platformLocale = this.getPlatformLocale();
        if (!platformLocale) {
            this.logger.warning("System language could not be found, falling back to english");

            return "en";
        }

        const baseNameCode = platformLocale.baseName.toLowerCase();
        if (!this.localeConfig.serverSupportedLocales.includes(baseNameCode)) {
            // Chek if base language (e.g. CN / EN / DE) exists
            const languageCode = platformLocale.language.toLocaleLowerCase();
            if (this.localeConfig.serverSupportedLocales.includes(languageCode)) {
                if (baseNameCode === "zh") {
                    // Handle edge case of zh
                    return "zh-cn";
                }

                return languageCode;
            }

            if (baseNameCode === "pt") {
                // Handle edge case of pt
                return "pt-pt";
            }

            this.logger.warning(`Unsupported system language found: ${baseNameCode}, falling back to english`);

            return "en";
        }

        return baseNameCode;
    }

    /**
     * Get the locale of the computer running the server
     * @returns langage part of locale e.g. 'en' part of 'en-US'
     */
    protected getPlatformForClientLocale(): string {
        const platformLocale = this.getPlatformLocale();
        if (!platformLocale) {
            this.logger.warning("System language could not be found, falling back to english");
            return "en";
        }

        const locales = this.databaseServer.getTables().locales;
        const baseNameCode = platformLocale.baseName?.toLocaleLowerCase();
        if (baseNameCode && locales.global[baseNameCode]) {
            return baseNameCode;
        }

        const languageCode = platformLocale.language?.toLowerCase();
        if (languageCode && locales.global[languageCode]) {
            return languageCode;
        }

        const regionCode = platformLocale.region?.toLocaleLowerCase();
        if (regionCode && locales.global[regionCode]) {
            return regionCode;
        }

        // BSG map DE to GE some reason
        if (platformLocale.language === "de") {
            return "ge";
        }

        this.logger.warning(`Unsupported system language found: ${languageCode}, falling back to english`);
        return "en";
    }

    /**
     * This is in a function so we can overwrite it during testing
     * @returns The current platform locale
     */
    protected getPlatformLocale(): Intl.Locale {
        return new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale);
    }
}
