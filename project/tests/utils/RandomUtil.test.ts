import "reflect-metadata";

import { beforeEach, describe, expect, it } from "@jest/globals";

import { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { TestHelper } from "../common/TestHelper";

const testHelper = new TestHelper();

const logger = testHelper.getTestLogger();
const jsonUtil = testHelper.getTestJsonUtil();

describe("test text", () =>
{
    let randomUtil: RandomUtil;
    beforeEach(() =>
    {
        randomUtil = new RandomUtil(jsonUtil, logger);
    });

    it("RandomUtil type check", () =>
    {
        expect(randomUtil).toBeInstanceOf(RandomUtil);
    });

    it("getInt()", () =>
    {
        expect(randomUtil.getInt(1, 1)).toBe(1);
        expect(randomUtil.getInt(100, 100)).toBe(100);
        expect([256, 257, 258, 259, 260, 261]).toContain(randomUtil.getInt(256, 261));
    });

    it("getIntEx()", () =>
    {
        expect(randomUtil.getIntEx(1)).toBe(1);
        expect([1, 2, 3]).toContain(randomUtil.getIntEx(5));
        expect([1, 2, 3, 4, 5, 6, 7, 8]).toContain(randomUtil.getIntEx(10));
    });

    it("getFloat()", () =>
    {
        const zeroToOneFloat = randomUtil.getFloat(0, 1);
        expect(zeroToOneFloat).toBeGreaterThanOrEqual(0);
        expect(zeroToOneFloat).toBeLessThan(1);
    });

    it("getBool()", () =>
    {
        expect([true, false]).toContain(randomUtil.getBool());
    });
});
