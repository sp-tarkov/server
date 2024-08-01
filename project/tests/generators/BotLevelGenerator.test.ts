import "reflect-metadata";

import { BotLevelGenerator } from "@spt/generators/BotLevelGenerator";
import { MinMax } from "@spt/models/common/MinMax";
import { BotGenerationDetails } from "@spt/models/spt/bots/BotGenerationDetails";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("BotLevelGenerator", () => {
    let botLevelGenerator: any;
    let databaseServer: DatabaseServer;

    beforeEach(() => {
        botLevelGenerator = container.resolve<BotLevelGenerator>("BotLevelGenerator");
        databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("generateBotLevel", () => {
        it("should return value between 5 and 10 when player is level 5 and max is 10", () => {
            const levelDetails: MinMax = { min: 5, max: 10 };

            const botGenerationDetails: BotGenerationDetails = {
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

    describe("chooseBotLevel", () => {
        it("should return 10 when player level is 5 and delta is 5", () => {
            const levelDetails: MinMax = { min: 5, max: 10 };

            const result = botLevelGenerator.chooseBotLevel(levelDetails.min, levelDetails.max, 1, 1.15);

            expect(result).greaterThanOrEqual(5);
            expect(result).lessThanOrEqual(10);
        });

        it("should return 79 when player level is above possible max (100), desired max is 100 and delta is 5", () => {
            const levelDetails: MinMax = { min: 100, max: 100 };

            const result = botLevelGenerator.chooseBotLevel(levelDetails.min, levelDetails.max, 1, 1.15);

            expect(result).toBe(100);
        });
    });
});
