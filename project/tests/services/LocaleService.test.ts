import type { LocaleService } from "@spt/services/LocaleService";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("LocaleService", () => {
    let localeService: any; // Using "any" to access private/protected methods without type errors.

    beforeEach(() => {
        localeService = container.resolve<LocaleService>("LocaleService");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getLocaleDb", () => {
        it("should return 'en' globals data when no desired locale found and display warning'", () => {
            vi.spyOn(localeService, "getDesiredGameLocale").mockReturnValue({
                undefined,
            });

            const warningLogSpy = vi.spyOn(localeService.logger, "warning");

            const result = localeService.getLocaleDb();
            expect(result["54cb50c76803fa8b248b4571 FirstName"]).equals("Pavel Yegorovich");

            expect(warningLogSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe("getDesiredGameLocale", () => {
        it("should return gameLocale property from config when value is not 'system''", () => {
            localeService.localeConfig.gameLocale = "test";

            expect(localeService.getDesiredGameLocale()).toBe("test");
        });

        it("should return desired value when gameLocale property from config is 'system'", () => {
            // Override the get locale so we control what the input is
            vi.spyOn(localeService, "getPlatformForClientLocale").mockReturnValue("desiredLocale");

            localeService.localeConfig.gameLocale = "system";

            expect(localeService.getDesiredGameLocale()).toBe("desiredLocale");
        });
    });

    describe("getDesiredServerLocale", () => {
        it("should return serverLocale property from config when value is not 'system''", () => {
            localeService.localeConfig.serverLocale = "test";

            expect(localeService.getDesiredServerLocale()).toBe("test");
        });

        it("should return desired value when serverLocale property from config is 'system'", () => {
            // Override the get locale so we control what the input is
            vi.spyOn(localeService, "getPlatformForServerLocale").mockReturnValue("desiredLocale");

            localeService.localeConfig.serverLocale = "system";

            expect(localeService.getDesiredServerLocale()).toBe("desiredLocale");
        });
    });

    describe("getPlatformForServerLocale", () => {
        it("should return 'en' when no system locale found and display warning'", () => {
            // Override the get locale so we control what the input is
            vi.spyOn(localeService, "getPlatformLocale").mockReturnValue(undefined);

            const warningLogSpy = vi.spyOn(localeService.logger, "warning");

            expect(localeService.getPlatformForServerLocale()).toBe("en");
            expect(warningLogSpy).toHaveBeenCalledTimes(1);
        });

        it("should return 'en' when unsupported system local encountered and display warning'", () => {
            // Override the get locale so we control what the input is
            vi.spyOn(localeService, "getPlatformLocale").mockReturnValue({
                baseName: "test_locale_that_doesnt_exist",
                language: "test_language",
            });

            const warningLogSpy = vi.spyOn(localeService.logger, "warning");

            expect(localeService.getPlatformForServerLocale()).toBe("en");
            expect(warningLogSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe("getPlatformForClientLocale", () => {
        it("should return 'en' when no platform locale found and display warning'", () => {
            // Override the get locale so we control what the input is
            vi.spyOn(localeService, "getPlatformLocale").mockReturnValue(undefined);
            const warningLogSpy = vi.spyOn(localeService.logger, "warning");

            expect(localeService.getPlatformForClientLocale()).toBe("en");
            expect(warningLogSpy).toHaveBeenCalledTimes(1);
        });

        it("should return 'en' when unsupported platform local encountered and display warning'", () => {
            // Override the get locale so we control what the input is
            localeService.getPlatformLocale = () => {
                return { baseName: "test_locale_that_doesnt_exist", language: "test_language" };
            };

            const warningLogSpy = vi.spyOn(localeService.logger, "warning");

            expect(localeService.getPlatformForClientLocale()).toBe("en");
            expect(warningLogSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe("ValidateServerLocale", () => {
        it("should return 'en' for 'en-US'", () => {
            // Override the get locale so we control what the input is
            vi.spyOn(localeService, "getPlatformLocale").mockReturnValue(new Intl.Locale("en-US"));

            expect(localeService.getPlatformForServerLocale()).toBe("en");
        });

        it("should return 'ko' for 'ko-KR'", () => {
            // Override the get locale so we control what the input is
            vi.spyOn(localeService, "getPlatformLocale").mockReturnValue(new Intl.Locale("ko-KR"));

            expect(localeService.getPlatformForServerLocale()).toBe("ko");
        });

        it("should return 'pt-pt' for 'pt-PT'", () => {
            // Override the get locale so we control what the input is
            vi.spyOn(localeService, "getPlatformLocale").mockReturnValue(new Intl.Locale("pt-PT"));

            expect(localeService.getPlatformForServerLocale()).toBe("pt-pt");
        });

        it("should return 'pt-br' for 'pt-BR'", () => {
            // Override the get locale so we control what the input is
            vi.spyOn(localeService, "getPlatformLocale").mockReturnValue(new Intl.Locale("pt-BR"));

            expect(localeService.getPlatformForServerLocale()).toBe("pt-br");
        });
    });

    describe("ValidateClientLocale", () => {
        it("should return 'en' for 'en-US'", () => {
            // Override the get locale so we control what the input is
            vi.spyOn(localeService, "getPlatformLocale").mockReturnValue(new Intl.Locale("en-US"));

            expect(localeService.getPlatformForClientLocale()).toBe("en");
        });

        it("should return 'kr' for 'ko-KR'", () => {
            // Override the get locale so we control what the input is
            vi.spyOn(localeService, "getPlatformLocale").mockReturnValue(new Intl.Locale("ko-KR"));

            expect(localeService.getPlatformForClientLocale()).toBe("kr");
        });

        it("should return 'es-mx' for 'es-MX'", () => {
            // Override the get locale so we control what the input is
            vi.spyOn(localeService, "getPlatformLocale").mockReturnValue(new Intl.Locale("es-MX"));

            expect(localeService.getPlatformForClientLocale()).toBe("es-mx");
        });

        it("should return 'cz' for 'cs-CZ'", () => {
            // Override the get locale so we control what the input is
            vi.spyOn(localeService, "getPlatformLocale").mockReturnValue(new Intl.Locale("cs-CZ"));

            expect(localeService.getPlatformForClientLocale()).toBe("cz");
        });

        it("should return 'ge' for 'de-DE'", () => {
            // Override the get locale so we control what the input is
            vi.spyOn(localeService, "getPlatformLocale").mockReturnValue(new Intl.Locale("de-DE"));

            expect(localeService.getPlatformForClientLocale()).toBe("ge");
        });
    });
});
