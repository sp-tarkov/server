import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocaleService } from "@spt-aki/services/LocaleService";

describe("LocaleService", () =>
{
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    let localeService: any; // Using "any" to access private/protected methods without type errors.

    beforeEach(() =>
    {
        localeService = container.resolve<LocaleService>("LocaleService");
    });

    afterEach(() =>
    {
        vi.restoreAllMocks();
    });

    describe("ValidateServerLocale", () =>
    {
        it("should return 'en' for 'en-US'", () =>
        {
            // Override the get locale so we control what the input is
            localeService.getPlatformLocale = () =>
            {
                return new Intl.Locale("en-US");
            };

            expect(localeService.getPlatformForServerLocale()).toBe("en");
        });

        it("should return 'ko' for 'ko-KR'", () =>
        {
            // Override the get locale so we control what the input is
            localeService.getPlatformLocale = () =>
            {
                return new Intl.Locale("ko-KR");
            };

            expect(localeService.getPlatformForServerLocale()).toBe("ko");
        });

        it("should return 'pt-pt' for 'pt-PT'", () =>
        {
            // Override the get locale so we control what the input is
            localeService.getPlatformLocale = () =>
            {
                return new Intl.Locale("pt-PT");
            };

            expect(localeService.getPlatformForServerLocale()).toBe("pt-pt");
        });

        it("should return 'pt-br' for 'pt-BR'", () =>
        {
            // Override the get locale so we control what the input is
            localeService.getPlatformLocale = () =>
            {
                return new Intl.Locale("pt-BR");
            };

            expect(localeService.getPlatformForServerLocale()).toBe("pt-br");
        });
    });

    describe("ValidateClientLocale", () =>
    {
        it("should return 'en' for 'en-US'", () =>
        {
            // Override the get locale so we control what the input is
            localeService.getPlatformLocale = () =>
            {
                return new Intl.Locale("en-US");
            };

            expect(localeService.getPlatformForClientLocale()).toBe("en");
        });

        it("should return 'kr' for 'ko-KR'", () =>
        {
            // Override the get locale so we control what the input is
            localeService.getPlatformLocale = () =>
            {
                return new Intl.Locale("ko-KR");
            };

            expect(localeService.getPlatformForClientLocale()).toBe("kr");
        });

        it("should return 'es-mx' for 'es-MX'", () =>
        {
            // Override the get locale so we control what the input is
            localeService.getPlatformLocale = () =>
            {
                return new Intl.Locale("es-MX");
            };

            expect(localeService.getPlatformForClientLocale()).toBe("es-mx");
        });

        it("should return 'cz' for 'cs-CZ'", () =>
        {
            // Override the get locale so we control what the input is
            localeService.getPlatformLocale = () =>
            {
                return new Intl.Locale("cs-CZ");
            };

            expect(localeService.getPlatformForClientLocale()).toBe("cz");
        });

        it("should return 'ge' for 'de-DE'", () =>
        {
            // Override the get locale so we control what the input is
            localeService.getPlatformLocale = () =>
            {
                return new Intl.Locale("de-DE");
            };

            expect(localeService.getPlatformForClientLocale()).toBe("ge");
        });
    });
});
