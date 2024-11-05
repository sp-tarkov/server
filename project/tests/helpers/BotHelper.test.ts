import "reflect-metadata";
import { BotHelper } from "@spt/helpers/BotHelper";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("BotHelper", () => {
    let botHelper: any;

    beforeEach(() => {
        botHelper = container.resolve<BotHelper>("BotHelper");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("isBotPmc", () => {
        it("should return true when lowercase PMC role is provided", () => {
            const result = botHelper.isBotPmc("usec");
            expect(result).toBe(true);
        });

        it("should return true when uppercase PMC role is provided", () => {
            const result = botHelper.isBotPmc("pmcBEAR");
            expect(result).toBe(true);
        });

        it("should return false when legitimate non-PMC role is provided", () => {
            const result = botHelper.isBotPmc("assault");
            expect(result).toBe(false);
        });

        it("should return false when legitimate non-PMC role is provided", () => {
            const result = botHelper.isBotPmc("FLUBBUB");
            expect(result).toBe(false);
        });

        it("should return false when undefined role is provided", () => {
            const result = botHelper.isBotPmc(undefined);
            expect(result).toBe(false);
        });

        it("should return false when empty string role is provided", () => {
            const result = botHelper.isBotPmc("");
            expect(result).toBe(false);
        });
    });

    describe("isBotBoss", () => {
        it("should return true when lowercase boss role is provided", () => {
            const result = botHelper.isBotBoss("bossboar");
            expect(result).toBe(true);
        });

        it("should return true when uppercase boss role is provided", () => {
            const result = botHelper.isBotBoss("BOSSBOAR");
            expect(result).toBe(true);
        });

        it("should return false when legitimate non-boss role is provided", () => {
            const result = botHelper.isBotBoss("assault");
            expect(result).toBe(false);
        });

        it("should return false when undefined role is provided", () => {
            const result = botHelper.isBotBoss(undefined);
            expect(result).toBe(false);
        });

        it("should return false when empty string role is provided", () => {
            const result = botHelper.isBotBoss("");
            expect(result).toBe(false);
        });
    });

    describe("getPmcSideByRole", () => {
        it("should return `Bear` when pmcBEAR role is provided", () => {
            const result = botHelper.getPmcSideByRole("pmcBEAR");
            expect(result).toBe("Bear");
        });

        it("should return `Usec` when pmcUSEC role is provided", () => {
            const result = botHelper.getPmcSideByRole("pmcUSEC");
            expect(result).toBe("Usec");
        });

        it("should return `Usec` or `Bear` when non-PMC role is provided", () => {
            const result = botHelper.getPmcSideByRole("assault");
            expect(["Usec", "Bear"]).toContain(result);
        });

        it("should return `Usec` or `Bear` when empty string role is provided", () => {
            const result = botHelper.getPmcSideByRole("");
            expect(["Usec", "Bear"]).toContain(result);
        });
    });

    describe("getRandomizedPmcSide", () => {
        it("should return `Bear` when isUsec config set to 0", () => {
            botHelper.pmcConfig.isUsec = 0;
            const result = botHelper.getRandomizedPmcSide();
            expect(result).toBe("Bear");
        });

        it("should return `Bear` when isUsec config set to 100", () => {
            botHelper.pmcConfig.isUsec = 100;
            const result = botHelper.getRandomizedPmcSide();
            expect(result).toBe("Usec");
        });
    });
});
