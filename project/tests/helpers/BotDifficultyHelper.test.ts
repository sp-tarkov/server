import "reflect-metadata";
import { BotDifficultyHelper } from "@spt/helpers/BotDifficultyHelper";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("BotHelper", () => {
    let botDifficultyHelper: any;

    beforeEach(() => {
        botDifficultyHelper = container.resolve<BotDifficultyHelper>("BotDifficultyHelper");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("convertBotDifficultyDropdownToBotDifficulty", () => {
        it("should return 'normal' when medium passed in", () => {
            expect(botDifficultyHelper.convertBotDifficultyDropdownToBotDifficulty("medium")).toBe("normal");
        });

        it("should return 'normal' when randomly capitalized medium passed in", () => {
            expect(botDifficultyHelper.convertBotDifficultyDropdownToBotDifficulty("mEdIuM")).toBe("normal");
        });

        it("should return passed in value when its not medium or random", () => {
            expect(botDifficultyHelper.convertBotDifficultyDropdownToBotDifficulty("test_value")).toBe("test_value");
        });

        it("should return randomised value when random passed in", () => {
            vi.spyOn(botDifficultyHelper, "chooseRandomDifficulty").mockReturnValue("randomValue");

            expect(botDifficultyHelper.convertBotDifficultyDropdownToBotDifficulty("random")).toBe("randomValue");
        });
    });

    describe("getBotDifficultySettings", () => {
        it("should return assault bot if invalid bot type provided", () => {
            vi.spyOn(botDifficultyHelper, "convertBotDifficultyDropdownToBotDifficulty").mockReturnValue("normal");
            vi.spyOn(botDifficultyHelper.botHelper, "getBotTemplate").mockReturnValue({
                difficulty: { normal: "test" },
            });
            const warningLogSpy = vi.spyOn(botDifficultyHelper.logger, "warning");

            const result = botDifficultyHelper.getBotDifficultySettings("INVALID_TYPE", "normal", { types: {} });
            expect(result).toBe("test");
            expect(warningLogSpy).toHaveBeenCalledTimes(1);
        });
    });
});
