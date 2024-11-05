import "reflect-metadata";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { PlayerService } from "@spt/services/PlayerService";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("PlayerService", () => {
    let playerService: PlayerService;

    beforeEach(() => {
        playerService = container.resolve<PlayerService>("PlayerService");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("calculateLevel", () => {
        it("should return 1 when player xp is 0", () => {
            const playerProfile = {
                Info: {
                    Experience: 0, // Via wiki: https://escapefromtarkov.fandom.com/wiki/Character_skills#Levels
                },
            };

            const result = playerService.calculateLevel(playerProfile as IPmcData);

            expect(result).toBe(1);
        });

        it("should return 1 when player xp is 999", () => {
            const playerProfile = {
                Info: {
                    Experience: 999, // Via wiki: https://escapefromtarkov.fandom.com/wiki/Character_skills#Levels
                },
            };

            const result = playerService.calculateLevel(playerProfile as IPmcData);

            expect(result).toBe(1);
        });

        it("should return 25 when player xp is 609,066", () => {
            const playerProfile = {
                Info: {
                    Experience: 609066, // Via wiki: https://escapefromtarkov.fandom.com/wiki/Character_skills#Levels
                },
            };

            const result = playerService.calculateLevel(playerProfile as IPmcData);

            expect(result).toBe(25);
        });

        it("should return 79 when player xp is 81,126,895", () => {
            const playerProfile = {
                Info: {
                    Experience: 81126895, // Via wiki: https://escapefromtarkov.fandom.com/wiki/Character_skills#Levels
                },
            };

            const result = playerService.calculateLevel(playerProfile as IPmcData);

            expect(result).toBe(79);
        });
    });
});
