import "reflect-metadata";

import { beforeEach, describe, expect, it } from "@jest/globals";
import { BotHelper } from "@spt-aki/helpers/BotHelper";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { TestHelper } from "./common/TestHelper";

let testHelper: TestHelper;
let logger: ILogger;
let jsonUtil: JsonUtil;
let randomUtil: RandomUtil;
let configServer: ConfigServer;
let localisationService: LocalisationService;
let databaseServer: DatabaseServer;


describe("BotHelper", () => {
    beforeAll(async () => {
        testHelper = await TestHelper.fetchTestHelper();
        logger = testHelper.getTestLogger();
        jsonUtil = testHelper.getTestJsonUtil();
        randomUtil = testHelper.getTestRandomUtil();
        configServer = testHelper.getTestConfigServer();
        localisationService = testHelper.getTestLocalisationService();
        databaseServer = testHelper.getTestDatabaseServer();
    })

    let helper: BotHelper;
    beforeEach(() => {
        helper = new BotHelper(logger, jsonUtil, databaseServer, randomUtil, localisationService, configServer);
    });

    it("BotHelper type check", () =>
    {
        expect(helper).toBeInstanceOf(BotHelper);
    });

    it("isBotPmc()", () =>
    {
        expect(helper.isBotPmc("usec")).toBe(true);
        expect(helper.isBotPmc("bear")).toBe(true);
        expect(helper.isBotPmc("faketype")).toBe(false);
    });

    it("isBotFollower()", () =>
    {
        expect(helper.isBotFollower("followerBully")).toBe(true);
        expect(helper.isBotFollower("FoLlOwErBULlY")).toBe(true);
        expect(helper.isBotFollower("followerSanitar")).toBe(true);
        expect(helper.isBotFollower("botFollower")).toBe(false);
    });

    it("getBotTemplate()", () =>
    {
        expect(helper.getBotTemplate("assault")).not.toBeFalsy();
        expect(helper.getBotTemplate("fakebottype")).toBeFalsy();
        expect(helper.getBotTemplate("")).toBeFalsy();
    });
});