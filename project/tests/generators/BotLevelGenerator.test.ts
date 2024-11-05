import "reflect-metadata";

import { BotLevelGenerator } from "@spt/generators/BotLevelGenerator";
import { MinMax } from "@spt/models/common/MinMax";
import { IBotGenerationDetails } from "@spt/models/spt/bots/BotGenerationDetails";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("BotLevelGenerator", () => {
    let botLevelGenerator: BotLevelGenerator;

    beforeEach(() => {
        botLevelGenerator = container.resolve<BotLevelGenerator>("BotLevelGenerator");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("generateBotLevel", () => {
        it("should return value between 5 and 10 when player is level 5 and max is 10", () => {
            const levelDetails: MinMax = { min: 5, max: 10 };

            const botGenerationDetails: IBotGenerationDetails = {
                isPmc: false,
                role: "",
                side: "",
                playerLevel: 5,
                botRelativeLevelDeltaMax: 0,
                botRelativeLevelDeltaMin: 0,
                botCountToGenerate: 0,
                botDifficulty: "",
                isPlayerScav: false,
            };

            const result = botLevelGenerator.generateBotLevel(levelDetails, botGenerationDetails, null);
            expect(result.level).greaterThan(0);
            expect(result.level).lessThan(10);
        });
    });

    describe("getRelativeBotLevelRange", () => {
        it("should return 10 when player level is 5 and delta is 5", () => {
            const levelDetails: MinMax = { min: 5, max: 10 };
            const botGenDetails: IBotGenerationDetails = {
                isPmc: false,
                role: "",
                side: "",
                botRelativeLevelDeltaMax: 5,
                botRelativeLevelDeltaMin: 5,
                playerLevel: 5,
                botCountToGenerate: 0,
                botDifficulty: "",
                isPlayerScav: false,
            };

            // @ts-expect-error
            const result = botLevelGenerator.getRelativeBotLevelRange(botGenDetails, levelDetails, 79);

            expect(result.max).toBe(10);
        });

        it("should return 79 when player level is above possible max (100), desired max is 100 and delta is 5", () => {
            const levelDetails: MinMax = { min: 100, max: 100 };
            const botGenDetails: IBotGenerationDetails = {
                isPmc: false,
                role: "",
                side: "",
                botRelativeLevelDeltaMax: 5,
                botRelativeLevelDeltaMin: 5,
                playerLevel: 100,
                botCountToGenerate: 0,
                botDifficulty: "",
                isPlayerScav: false,
            };

            // @ts-expect-error
            const result = botLevelGenerator.getRelativeBotLevelRange(botGenDetails, levelDetails, 79);

            expect(result.max).toBe(79);
        });
    });
});
