import "reflect-metadata";

import { beforeEach, describe, expect, it } from "@jest/globals";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { TestHelper } from "../common/TestHelper";

const testHelper = new TestHelper();

describe("test text", () => {
    let hashUtil: HashUtil;
    beforeEach(() => {
        hashUtil = testHelper.getTestHashUtil();
    });

    it("HashUtil type check", () => {
        expect(hashUtil).toBeInstanceOf(HashUtil);
    });

    it("generate()", () => {
        expect(hashUtil.generate()).toHaveLength(24);
    });

    it("generateMd5ForData()", () => {
        expect(hashUtil.generateMd5ForData("test")).toBe("098f6bcd4621d373cade4e832627b4f6");
        expect(hashUtil.generateMd5ForData("longerString12345678910")).toBe("c3e76c3c118c14e357e61ae1dbad4cf7");
    });
});
