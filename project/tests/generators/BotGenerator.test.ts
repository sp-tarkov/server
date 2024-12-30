import "reflect-metadata";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { BotNameService } from "@spt/services/BotNameService";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("BotGenerator", () => {
    let botNameService: any;

    beforeEach(() => {
        botNameService = container.resolve<BotNameService>("BotNameService");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // describe("prepareAndGenerateBots", () =>
    // {
    //     it("should return a single generated assault bot", () =>
    //     {
    //         const mockPlayerProfile = {
    //             Info: {
    //                 Nickname: "Player Nickname",
    //                 Level: 1
    //             }
    //         };

    //         vi.spyOn(botGenerator.profileHelper, "getPmcProfile").mockReturnValue(<IPmcData>mockPlayerProfile);
    //         vi.spyOn(botGenerator.botEquipmentFilterService.profileHelper, "getPmcProfile").mockReturnValue(<IPmcData>mockPlayerProfile);
    //         vi.spyOn(botGenerator.botInventoryGenerator.botWeaponGenerator.botEquipmentModGenerator.profileHelper, "getPmcProfile").mockReturnValue(<IPmcData>mockPlayerProfile);

    //         const sessionId = "12345";
    //         const generationDetails: BotGenerationDetails = {
    //             isPmc: false,
    //             role: "assault",
    //             side: "Savage",
    //             playerLevel: 1,
    //             botRelativeLevelDeltaMax: 10,
    //             botCountToGenerate: 1,
    //             botDifficulty: "easy",
    //             isPlayerScav: false
    //         };

    //         const result = botGenerator.prepareAndGenerateBots(sessionId, generationDetails);

    //         expect(result.length).toBe(1);
    //         expect(result[0].Info.Side).toBe("Savage");
    //     });
    // });

    describe("generateUniqueBotNickname", () => {
        it("should choose random firstname for non player scav assault bot", () => {
            const botJsonTemplate = { firstName: ["one", "two"], lastName: [] };
            const botGenerationDetails = { isPlayerScav: false, isPmc: false, allPmcsHaveSameNameAsPlayer: false };
            const botRole = "assault";

            botNameService.botConfig.chanceAssaultScavHasPlayerScavName = 0;

            const mockPlayerProfile = { Info: { Nickname: "Player Nickname", Level: 1 } };
            vi.spyOn(botNameService.profileHelper, "getPmcProfile").mockReturnValue(<IPmcData>mockPlayerProfile);

            const result = botNameService.generateUniqueBotNickname(botJsonTemplate, botGenerationDetails, botRole);

            expect(result).toMatch(/(one|two)/);
        });

        it("should choose random lastname for non player scav assault bot", () => {
            const botJsonTemplate = { firstName: [], lastName: [["one", "two"]] };
            const botGenerationDetails = { isPlayerScav: false, isPmc: false, allPmcsHaveSameNameAsPlayer: false };
            const botRole = "assault";

            botNameService.botConfig.chanceAssaultScavHasPlayerScavName = 0;

            const mockPlayerProfile = { Info: { Nickname: "Player Nickname", Level: 1 } };
            vi.spyOn(botNameService.profileHelper, "getPmcProfile").mockReturnValue(<IPmcData>mockPlayerProfile);

            const result = botNameService.generateUniqueBotNickname(botJsonTemplate, botGenerationDetails, botRole);

            expect(result).toMatch(/(one|two)/);
        });

        it("should choose random firstname and lastname for non player scav assault bot", () => {
            const botJsonTemplate = { firstName: ["first-one", "first-two"], lastName: [["last-one", "last-two"]] };
            const botGenerationDetails = { isPlayerScav: false, isPmc: false, allPmcsHaveSameNameAsPlayer: false };
            const botRole = "assault";

            botNameService.botConfig.chanceAssaultScavHasPlayerScavName = 0;

            const mockPlayerProfile = { Info: { Nickname: "Player Nickname", Level: 1 } };
            vi.spyOn(botNameService.profileHelper, "getPmcProfile").mockReturnValue(<IPmcData>mockPlayerProfile);

            const result = botNameService.generateUniqueBotNickname(botJsonTemplate, botGenerationDetails, botRole);

            expect(result).toMatch(/first-(one|two) last-(one|two)/);
        });

        it("should choose random firstname for player scav assault bot", () => {
            const botJsonTemplate = { firstName: ["one", "two"], lastName: [] };
            const botGenerationDetails = { isPlayerScav: true, isPmc: false, allPmcsHaveSameNameAsPlayer: false };
            const botRole = "assault";

            botNameService.botConfig.chanceAssaultScavHasPlayerScavName = 0;

            const mockPlayerProfile = { Info: { Nickname: "Player Nickname", Level: 1 } };
            vi.spyOn(botNameService.profileHelper, "getPmcProfile").mockReturnValue(<IPmcData>mockPlayerProfile);

            const result = botNameService.generateUniqueBotNickname(botJsonTemplate, botGenerationDetails, botRole);

            expect(result).toMatch(/(one|two)/);
        });

        it("should choose random lastname for player scav assault bot", () => {
            const botJsonTemplate = { firstName: [], lastName: [["one", "two"]] };
            const botGenerationDetails = { isPlayerScav: true, isPmc: false, allPmcsHaveSameNameAsPlayer: false };
            const botRole = "assault";

            botNameService.botConfig.chanceAssaultScavHasPlayerScavName = 0;

            const mockPlayerProfile = { Info: { Nickname: "Player Nickname", Level: 1 } };
            vi.spyOn(botNameService.profileHelper, "getPmcProfile").mockReturnValue(<IPmcData>mockPlayerProfile);

            const result = botNameService.generateUniqueBotNickname(botJsonTemplate, botGenerationDetails, botRole);

            expect(result).toMatch(/(one|two)/);
        });

        it("should choose random firstname and lastname for player scav assault bot", () => {
            const botJsonTemplate = { firstName: ["first-one", "first-two"], lastName: [["last-one", "last-two"]] };
            const botGenerationDetails = { isPlayerScav: true, isPmc: false, allPmcsHaveSameNameAsPlayer: false };
            const botRole = "assault";

            botNameService.botConfig.chanceAssaultScavHasPlayerScavName = 0;

            const mockPlayerProfile = { Info: { Nickname: "Player Nickname", Level: 1 } };
            vi.spyOn(botNameService.profileHelper, "getPmcProfile").mockReturnValue(<IPmcData>mockPlayerProfile);

            const result = botNameService.generateUniqueBotNickname(botJsonTemplate, botGenerationDetails, botRole);

            expect(result).toMatch(/first-(one|two) last-(one|two)/);
        });

        it("should append bot type to end of name when showTypeInNickname option is enabled ", () => {
            const botJsonTemplate = { firstName: ["firstname"], lastName: ["lastname"] };
            const botGenerationDetails = { isPlayerScav: false, isPmc: false, allPmcsHaveSameNameAsPlayer: false };
            const botRole = "assault";

            botNameService.botConfig.chanceAssaultScavHasPlayerScavName = 0;
            botNameService.botConfig.showTypeInNickname = true;

            const mockPlayerProfile = { Info: { Nickname: "Player Nickname", Level: 1 } };
            vi.spyOn(botNameService.profileHelper, "getPmcProfile").mockReturnValue(<IPmcData>mockPlayerProfile);

            const result = botNameService.generateUniqueBotNickname(botJsonTemplate, botGenerationDetails, botRole);

            expect(result).toBe("firstname lastname assault");
        });

        it("should return name prefix for PMC bot with same name as player if allPmcsHaveSameNameAsPlayer is enabled", () => {
            const botJsonTemplate = { firstName: ["player"], lastName: [] };
            const botGenerationDetails = { isPlayerScav: false, isPmc: true, allPmcsHaveSameNameAsPlayer: true };
            const botRole = "assault";

            botNameService.botConfig.showTypeInNickname = false;
            botNameService.pmcConfig.addPrefixToSameNamePMCAsPlayerChance = 100;

            const mockPlayerProfile = { Info: { Nickname: "player", Level: 1 } };
            vi.spyOn(botNameService.profileHelper, "getPmcProfile").mockReturnValue(<IPmcData>mockPlayerProfile);
            vi.spyOn(botNameService.botHelper, "getPmcNicknameOfMaxLength").mockReturnValue("player");

            const getRandomTextThatMatchesPartialKeySpy = vi
                .spyOn((botNameService as any).localisationService, "getRandomTextThatMatchesPartialKey")
                .mockReturnValue("test");

            const result = botNameService.generateUniqueBotNickname(botJsonTemplate, botGenerationDetails, botRole);

            expect(getRandomTextThatMatchesPartialKeySpy).toHaveBeenCalled();
            expect(result).toBe("test player");
        });
    });
});
