import "reflect-metadata";

import { RepairHelper } from "@spt-aki/helpers/RepairHelper";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { TestHelper } from "./common/TestHelper";

let testHelper: TestHelper;
let logger: ILogger;
let jsonUtil: JsonUtil;
let randomUtil: RandomUtil;
let configServer: ConfigServer;
let databaseServer: DatabaseServer;
let helper: RepairHelper;

describe("BotHelper", () => {

    beforeAll(async () => {
        testHelper = await TestHelper.fetchTestHelper();
        logger = testHelper.getTestLogger();
        jsonUtil = testHelper.getTestJsonUtil();
        randomUtil = testHelper.getTestRandomUtil();
        configServer = testHelper.getTestConfigServer();
        databaseServer = testHelper.getTestDatabaseServer();
    })

    beforeEach(() => {
        helper = new RepairHelper(
            logger,
            jsonUtil,
            randomUtil,
            databaseServer,
            configServer);
    });

    it("RepairHelper type check", () =>
    {
        expect(helper).toBeInstanceOf(RepairHelper);
    });

    it("updateItemDurability() repairkit with slick armor with max dura degradation", () =>
    {
        const slickTpl = "5e4abb5086f77406975c9342";
        const itemToRepair: Item = {
            _id: "12345",
            _tpl: slickTpl,
            upd: {
                Repairable: {
                    Durability: 60,
                    MaxDurability: 80
                }
            }
        };
        const itemToRepairDetails = <ITemplateItem>databaseServer.getTables().templates?.items[slickTpl];
        const isArmor = true;
        const useRepairKit = true;
        const useDegridation = true;

        helper.updateItemDurability(itemToRepair, itemToRepairDetails, isArmor, 5, useRepairKit, 1, useDegridation);

        expect(itemToRepair.upd?.Repairable?.Durability).toBeLessThan(80);
    });

    it("updateItemDurability() trader with slick armor with max dura degradation - partial repair", () =>
    {
        const slickTpl = "5e4abb5086f77406975c9342";
        const itemToRepair: Item = {
            _id: "12345",
            _tpl: slickTpl,
            upd: {
                Repairable: {
                    Durability: 60,
                    MaxDurability: 80
                }
            }
        };
        const itemToRepairDetails = <ITemplateItem>databaseServer.getTables().templates?.items[slickTpl];
        const isArmor = true;
        const useRepairKit = false;
        const useDegridation = true;

        helper.updateItemDurability(itemToRepair, itemToRepairDetails, isArmor, 5, useRepairKit, 1.2, useDegridation);

        expect(itemToRepair.upd?.Repairable?.Durability).toBeLessThan(80);
        expect(itemToRepair.upd?.Repairable?.Durability).toBeLessThanOrEqual(itemToRepair.upd?.Repairable?.MaxDurability);
    });

    it("updateItemDurability() trader with slick armor, no dura degradation", () =>
    {
        const slickTpl = "5e4abb5086f77406975c9342";
        const itemToRepair: Item = {
            _id: "12345",
            _tpl: slickTpl,
            upd: {
                Repairable: {
                    Durability: 60,
                    MaxDurability: 80
                }
            }
        };
        const itemToRepairDetails = <ITemplateItem>databaseServer.getTables().templates?.items[slickTpl];
        const isArmor = true;
        const useRepairKit = false;
        const useDegradation = false;

        helper.updateItemDurability(itemToRepair, itemToRepairDetails, isArmor, 20, useRepairKit, 1.2, useDegradation);

        expect(itemToRepair.upd?.Repairable?.Durability).toBe(80);
        expect(itemToRepair.upd?.Repairable?.Durability).toBeLessThanOrEqual(itemToRepair.upd?.Repairable?.MaxDurability);
    });

    it("updateItemDurability() repairkit with g36 with max dura degradation - Full repair", () =>
    {
        const itemCurrentDura = 68;
        const itemCurrentMaxDura = 100;
        const duraDifference = itemCurrentMaxDura - itemCurrentDura;
        const g36Tpl = "623063e994fc3f7b302a9696";
        const itemToRepair: Item = {
            _id: "12345",
            _tpl: g36Tpl,
            upd: {
                Repairable: {
                    Durability: itemCurrentDura,
                    MaxDurability: itemCurrentMaxDura
                }
            }
        };
        const itemToRepairDetails = <ITemplateItem>databaseServer.getTables().templates?.items[g36Tpl];
        const isArmor = false;
        const useRepairKit = true;
        const useDegradation = true;

        helper.updateItemDurability(itemToRepair, itemToRepairDetails, isArmor, duraDifference, useRepairKit, 1, useDegradation);

        expect(itemToRepair.upd?.Repairable?.Durability).toBeLessThan(100);
        expect(itemToRepair.upd?.Repairable?.Durability).toBeLessThanOrEqual(itemToRepair.upd?.Repairable?.MaxDurability);
    });

    it("updateItemDurability() trader with g36 with max dura degradation - Full repair", () =>
    {
        const itemCurrentDura = 68;
        const itemCurrentMaxDura = 100;
        const duraDifference = itemCurrentMaxDura - itemCurrentDura;
        const g36Tpl = "623063e994fc3f7b302a9696";
        const itemToRepair: Item = {
            _id: "12345",
            _tpl: g36Tpl,
            upd: {
                Repairable: {
                    Durability: itemCurrentDura,
                    MaxDurability: itemCurrentMaxDura
                }
            }
        };
        const itemToRepairDetails = <ITemplateItem>databaseServer.getTables().templates?.items[g36Tpl];
        const isArmor = false;
        const useRepairKit = false;
        const useDegradation = true;

        helper.updateItemDurability(itemToRepair, itemToRepairDetails, isArmor, duraDifference, useRepairKit, 1.2, useDegradation);

        expect(itemToRepair.upd?.Repairable?.Durability).toBeLessThan(100);
        expect(itemToRepair.upd?.Repairable?.Durability).toBeLessThanOrEqual(itemToRepair.upd?.Repairable?.MaxDurability);
    });

    it("updateItemDurability() faceshield broken use repairkit with max dura degradation", () =>
    {
        const twExfilBallisticFaceShieldTpl = "5e00cdd986f7747473332240";
        const itemToRepair: Item = {
            _id: "12345",
            _tpl: twExfilBallisticFaceShieldTpl,
            upd: {
                Repairable: {
                    Durability: 30,
                    MaxDurability: 45
                },
                FaceShield: {
                    Hits: 2
                }
            }
        };

        const itemToRepairDetails = <ITemplateItem>databaseServer.getTables().templates?.items[twExfilBallisticFaceShieldTpl];
        const isArmor = true;
        const useRepairKit = true;
        const useDegradation = true;

        helper.updateItemDurability(itemToRepair, itemToRepairDetails, isArmor, 5, useRepairKit, 1, useDegradation);

        expect(itemToRepair.upd?.FaceShield?.Hits).toBe(0);
        expect(itemToRepair.upd?.Repairable?.Durability).toBeLessThan(45);
        expect(itemToRepair.upd?.Repairable?.Durability).toBeLessThanOrEqual(itemToRepair.upd?.Repairable?.MaxDurability);
    });

    it("isWeaponTemplate() g36 weapon", () =>
    {
        const result = helper.isWeaponTemplate("623063e994fc3f7b302a9696");

        expect(result).toBe(true);
    });

    it("isWeaponTemplate() slick armor", () =>
    {
        const result = helper.isWeaponTemplate("5e4abb5086f77406975c9342");

        expect(result).toBe(false);
    });
});