import "reflect-metadata";

import { beforeEach, describe, expect, it } from "@jest/globals";
import { UUidGenerator } from "@spt-aki/utils/UUidGenerator";
import { TestHelper } from "../common/TestHelper";

const testHelper = new TestHelper();

describe("test text", () =>
{
    let uuidGenerator: UUidGenerator;
    beforeEach(() =>
    {
        uuidGenerator = testHelper.getTestUuidGenerator();
    });

    it("UUidGenerator type check", () =>
    {
        expect(uuidGenerator).toBeInstanceOf(UUidGenerator);
    });

    it("generate()", () =>
    {
        expect(uuidGenerator.generate()).toHaveLength(36);
        expect(uuidGenerator.generate()).toContain("-");
        expect(uuidGenerator.generate()).toContain("4");
    });
});
