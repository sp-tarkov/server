import "reflect-metadata";

import { beforeEach, describe, expect, it } from "@jest/globals";
import { BotDifficultyHelper } from "@spt-aki/helpers/BotDifficultyHelper";
import { BotHelper } from "@spt-aki/helpers/BotHelper";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { MockHelper } from "./common/MockHelper";
import { TestHelper } from "./common/TestHelper";

const mockHelper = new MockHelper();
let testHelper: TestHelper;
let logger: ILogger;
let jsonUtil: JsonUtil;
let randomUtil: RandomUtil;
let configServer: ConfigServer;
let localisationService: LocalisationService;
let databaseServer: DatabaseServer;
let botHelper: BotHelper;

describe("BotHelper", () => {
    beforeAll(async () => {
        testHelper = await TestHelper.fetchTestHelper();
        logger = testHelper.getTestLogger();
        jsonUtil = testHelper.getTestJsonUtil();
        randomUtil = testHelper.getTestRandomUtil();
        configServer = testHelper.getTestConfigServer();
        localisationService = testHelper.getTestLocalisationService();
        databaseServer = testHelper.getTestDatabaseServer();
        botHelper = testHelper.getTestBotHelper();
    })

    let botDifficultyHelper: BotDifficultyHelper;
    beforeEach(() =>
    {
        botDifficultyHelper = new BotDifficultyHelper(logger, jsonUtil, databaseServer, randomUtil, localisationService, botHelper, configServer);
    });

    it("BotDifficultyHelper type check", () =>
    {
        expect(botDifficultyHelper).toBeInstanceOf(BotDifficultyHelper);
    });

    it("chooseRandomDifficulty()", () =>
    {
        expect(["easy", "normal", "hard", "impossible"]).toContain(botDifficultyHelper.chooseRandomDifficulty());
    });

    it("getPmcDifficultySettings() easy", () =>
    {
        expect(botDifficultyHelper.getPmcDifficultySettings("bear", "easy", "sptUsec", "sptBear")).not.toBeFalsy();
    });

    it("getPmcDifficultySettings() random", () =>
    {
        expect(botDifficultyHelper.getPmcDifficultySettings("usec", "random", "sptUsec", "sptBear")).not.toBeFalsy();
    });

    it("getPmcDifficultySettings() difficulty set to 'medium' in config", () =>
    {

        const configServerMock = mockHelper.getMockConfigServer();
        const mockBotConfig = {
            kind: "aki-bot",
            pmc: {
                difficulty: "medium",
                enemyTypes: ["assault"]
            }
        };
        configServerMock.setup(x => x.getConfig(ConfigTypes.BOT)).returns(() => mockBotConfig);

        const testOnlyHelper = new BotDifficultyHelper(logger, jsonUtil, databaseServer, randomUtil, localisationService, botHelper, configServerMock.object);

        expect(testOnlyHelper.getPmcDifficultySettings("usec", "medium", "sptUsec", "sptBear")).not.toBeFalsy();
    });

});