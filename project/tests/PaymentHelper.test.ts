import "reflect-metadata";

import { beforeEach, describe, expect, it } from "@jest/globals";
import { PaymentHelper } from "@spt-aki/helpers/PaymentHelper";

describe("test text", () =>
{
    let helper: PaymentHelper;
    beforeEach(() =>
    {
        helper = new PaymentHelper();
    });

    it("PaymentHelper type check", () =>
    {
        expect(helper).toBeInstanceOf(PaymentHelper);
    });

    it("isMoneyTpl() USD", () =>
    {
        expect(helper.isMoneyTpl("5696686a4bdc2da3298b456a")).toBe(true);
    });

    it("isMoneyTpl() euro", () =>
    {
        expect(helper.isMoneyTpl("569668774bdc2da2298b4568")).toBe(true); // euro
    });

    it("isMoneyTpl() rouble", () =>
    {
        expect(helper.isMoneyTpl("5696686a4bdc2da3298b456a")).toBe(true); // rub
        expect(helper.isMoneyTpl("")).toBe(false);
        expect(helper.isMoneyTpl("faketpl")).toBe(false);
    });

    it("isMoneyTpl() empty tpl", () =>
    {
        expect(helper.isMoneyTpl("")).toBe(false);
    });

    it("isMoneyTpl() invalid tpl", () =>
    {
        expect(helper.isMoneyTpl("faketpl")).toBe(false);
    });

    it("getCurrency()", () =>
    {
        expect(helper.getCurrency("EUR")).toBe("569668774bdc2da2298b4568");
        expect(helper.getCurrency("USD")).toBe("5696686a4bdc2da3298b456a");
        expect(helper.getCurrency("RUB")).toBe("5449016a4bdc2d6f028b456f");
        expect(helper.getCurrency("1234353434534")).toBe("");
        expect(helper.getCurrency("")).toBe("");
    });
});
