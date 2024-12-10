import "reflect-metadata";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("RandomUtil", () => {
    let randomUtil: RandomUtil;
    let mockCloner: any;
    let mockLogger: any;

    beforeEach(() => {
        mockCloner = {
            clone: vi.fn((obj) => JSON.parse(JSON.stringify(obj))),
        };
        mockLogger = {
            warning: vi.fn(),
            info: vi.fn(),
            debug: vi.fn(),
        };
        randomUtil = new RandomUtil(mockCloner, mockLogger);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getNumberPrecision", () => {
        it("should return the number of decimal places in a single digit number with up to 15 decimal places (IEEE-754 standard safe-upper bounds)", () => {
            const number = 0.123456789012345;
            const result = (randomUtil as any).getNumberPrecision(number);

            expect(result).toBe(15);
        });

        it("should return 0 for whole numbers", () => {
            const number = 123;
            const result = (randomUtil as any).getNumberPrecision(number);

            expect(result).toBe(0);
        });

        it("should return 0 for numbers with zero value decimals", () => {
            const number = 123.0;
            const result = (randomUtil as any).getNumberPrecision(number);

            expect(result).toBe(0);
        });
    });

    describe("getInt", () => {
        it("should return an integer between min and max inclusive when min < max", () => {
            const min = 1;
            const max = 5;
            const result = randomUtil.getInt(min, max);

            expect(result).toBeGreaterThanOrEqual(Math.ceil(min));
            expect(result).toBeLessThanOrEqual(Math.floor(max));
            expect(Number.isInteger(result)).toBe(true);
        });

        it("should handle floating-point min and max values", () => {
            const min = 1.2;
            const max = 5.8;
            const result = randomUtil.getInt(min, max);

            expect(result).toBeGreaterThanOrEqual(Math.ceil(min)); // 2
            expect(result).toBeLessThanOrEqual(Math.floor(max)); // 5
            expect(Number.isInteger(result)).toBe(true);
        });

        it("should return min when min and max are equal", () => {
            const min = 3;
            const max = 3;
            const result = randomUtil.getInt(min, max);

            expect(result).toBe(Math.ceil(min));
            expect(Number.isInteger(result)).toBe(true);
        });

        it("should return min when max is less than min", () => {
            const min = 5;
            const max = 3;
            const result = randomUtil.getInt(min, max);

            expect(result).toBe(Math.ceil(min));
            expect(Number.isInteger(result)).toBe(true);
        });

        it("should handle negative min and max values", () => {
            const min = -5;
            const max = -1;
            const result = randomUtil.getInt(min, max);

            expect(result).toBeGreaterThanOrEqual(Math.ceil(min));
            expect(result).toBeLessThanOrEqual(Math.floor(max));
            expect(Number.isInteger(result)).toBe(true);
        });
    });

    describe("getIntEx", () => {
        it("should return an integer between 1 and max - 2 inclusive when max > 1", () => {
            const max = 10;
            const result = randomUtil.getIntEx(max);

            expect(result).toBeGreaterThanOrEqual(1);
            expect(result).toBeLessThanOrEqual(max - 2);
            expect(Number.isInteger(result)).toBe(true);
        });

        it("should return 1 when max is less than or equal to 1", () => {
            const maxValues = [1, 0, -5];
            for (const max of maxValues) {
                const result = randomUtil.getIntEx(max);
                expect(result).toBe(1);
            }
        });

        it("should handle edge case when max is 2", () => {
            const max = 2;
            const result = randomUtil.getIntEx(max);

            expect(result).toBe(1);
        });
    });

    describe("getFloat", () => {
        it("should return a float between min and max", () => {
            const min = 1.5;
            const max = 5.5;
            const result = randomUtil.getFloat(min, max);

            expect(result).toBeGreaterThanOrEqual(min);
            expect(result).toBeLessThan(max);
        });

        it("should handle negative min and max values", () => {
            const min = -5.5;
            const max = -1.1;
            const result = randomUtil.getFloat(min, max);

            expect(result).toBeGreaterThanOrEqual(min);
            expect(result).toBeLessThan(max);
        });

        it("should return min when min equals max", () => {
            const min = 3.3;
            const max = 3.3;
            const result = randomUtil.getFloat(min, max);

            expect(result).toBe(min);
        });
    });

    describe("getBool", () => {
        it("should return a boolean value", () => {
            const result = randomUtil.getBool();
            expect(typeof result).toBe("boolean");
        });

        it("should return true when Math.random is less than 0.5", () => {
            vi.spyOn(randomUtil as any, "getSecureRandomNumber").mockReturnValue(0.4);
            const result = randomUtil.getBool();
            expect(result).toBe(true);
        });

        it("should return false when getSecureRandomNumber returns 0.5", () => {
            vi.spyOn(randomUtil as any, "getSecureRandomNumber").mockReturnValue(0.5);
            const result = randomUtil.getBool();
            expect(result).toBe(false);
        });
    });

    describe("getPercentOfValue", () => {
        it("should calculate the correct percentage of a number", () => {
            const percent = 25;
            const number = 200;
            const result = randomUtil.getPercentOfValue(percent, number);

            expect(result).toBe(50.0);
        });

        it("should handle decimal percentages and numbers", () => {
            const percent = 12.5;
            const number = 80.4;
            const result = randomUtil.getPercentOfValue(percent, number);

            expect(result).toBeCloseTo(10.05, 2);
        });

        it("should respect the toFixed parameter", () => {
            const percent = 33.3333;
            const number = 100;
            const result = randomUtil.getPercentOfValue(percent, number, 4);

            expect(result).toBe(33.3333);
        });
    });

    describe("reduceValueByPercent", () => {
        it("should reduce the value by the given percentage", () => {
            const number = 200;
            const percentage = 25;
            const result = randomUtil.reduceValueByPercent(number, percentage);

            expect(result).toBe(150);
        });

        it("should handle decimal percentages", () => {
            const number = 100;
            const percentage = 12.5;
            const result = randomUtil.reduceValueByPercent(number, percentage);

            expect(result).toBe(87.5);
        });

        it("should return the same number when percentage is 0", () => {
            const number = 100;
            const percentage = 0;
            const result = randomUtil.reduceValueByPercent(number, percentage);

            expect(result).toBe(100);
        });
    });

    describe("getChance100", () => {
        it("should return true if random number is less than or equal to chancePercent", () => {
            vi.spyOn(randomUtil, "getIntEx").mockReturnValue(50);

            const chancePercent = 60;
            const result = randomUtil.getChance100(chancePercent);

            expect(result).toBe(true);
            expect(randomUtil.getIntEx).toHaveBeenCalledWith(100);
        });

        it("should return false if random number is greater than chancePercent", () => {
            vi.spyOn(randomUtil, "getIntEx").mockReturnValue(70);

            const chancePercent = 60;
            const result = randomUtil.getChance100(chancePercent);

            expect(result).toBe(false);
        });
    });

    describe("getStringArrayValue", () => {
        it("should return a value from the array", () => {
            const arr = ["apple", "banana", "cherry"];
            const result = randomUtil.getStringArrayValue(arr);

            expect(arr).toContain(result);
        });

        it("should handle single-element arrays", () => {
            const arr = ["only"];
            const result = randomUtil.getStringArrayValue(arr);

            expect(result).toBe("only");
        });

        it("should return predictable value when getInt is mocked", () => {
            vi.spyOn(randomUtil, "getInt").mockReturnValue(1);

            const arr = ["first", "second", "third"];
            const result = randomUtil.getStringArrayValue(arr);

            expect(result).toBe("second");
        });
    });

    describe("getArrayValue", () => {
        it("should return a value from the array of numbers", () => {
            const arr = [10, 20, 30, 40];
            const result = randomUtil.getArrayValue(arr);

            expect(arr).toContain(result);
        });

        it("should return a value from the array of objects", () => {
            const arr = [{ id: 1 }, { id: 2 }, { id: 3 }];
            const result = randomUtil.getArrayValue(arr);

            expect(arr).toContain(result);
        });

        it("should return predictable value when getInt is mocked", () => {
            vi.spyOn(randomUtil, "getInt").mockReturnValue(2);

            const arr = ["a", "b", "c", "d"];
            const result = randomUtil.getArrayValue(arr);

            expect(result).toBe("c");
        });
    });

    describe("getKey", () => {
        it("should return a key from the object", () => {
            const obj = { a: 1, b: 2, c: 3 };
            const result = randomUtil.getKey(obj);

            expect(Object.keys(obj)).toContain(result);
        });

        it("should handle single-key objects", () => {
            const obj = { onlyKey: "value" };
            const result = randomUtil.getKey(obj);

            expect(result).toBe("onlyKey");
        });

        it("should handle empty objects", () => {
            const obj = {};
            const result = randomUtil.getKey(obj);

            expect(result).toBeUndefined();
        });

        it("should handle objects with integer keys", () => {
            const obj = { 1: "a", 2: "b", 3: "c" };
            const result = randomUtil.getKey(obj);

            expect(Object.keys(obj)).toContain(result);
        });

        it("should return predictable key when getArrayValue is mocked", () => {
            vi.spyOn(randomUtil, "getArrayValue").mockReturnValue("b");

            const obj = { a: 1, b: 2, c: 3 };
            const result = randomUtil.getKey(obj);

            expect(result).toBe("b");
        });
    });

    describe("getKeyValue", () => {
        it("should return a value from the object", () => {
            vi.spyOn(randomUtil, "getKey").mockReturnValue("b");

            const obj = { a: 1, b: 2, c: 3 };
            const result = randomUtil.getKeyValue(obj);

            expect(result).toBe(2);
        });

        it("should handle objects with complex values", () => {
            vi.spyOn(randomUtil, "getKey").mockReturnValue("key2");

            const obj = { key1: "value1", key2: { nested: true }, key3: [1, 2, 3] };
            const result = randomUtil.getKeyValue(obj);

            expect(result).toEqual({ nested: true });
        });
    });

    describe("getNormallyDistributedRandomNumber", () => {
        it("should return a number close to the mean", () => {
            const mean = 50;
            const sigma = 5;
            const result = randomUtil.getNormallyDistributedRandomNumber(mean, sigma);

            expect(result).toBeGreaterThanOrEqual(0);
            expect(typeof result).toBe("number");
        });

        it("should not return negative numbers", () => {
            const mean = 5;
            const sigma = 10;
            const result = randomUtil.getNormallyDistributedRandomNumber(mean, sigma);

            expect(result).toBeGreaterThanOrEqual(0);
        });

        it("should handle high attempt counts", () => {
            let callCount = 0;
            vi.spyOn(randomUtil as any, "getSecureRandomNumber").mockImplementation(() => {
                callCount++;
                // Alternate between u and v
                if (callCount % 2 === 1) {
                    // u values
                    return 0.00001;
                }
                // v values
                return 0.5;
            });

            const mean = 5;
            const sigma = 2;
            const result = randomUtil.getNormallyDistributedRandomNumber(mean, sigma);

            // Each attempt increases callCount by 2 (once for u, once for v)
            const attempts = callCount / 2;

            // Ensure that the method attempted multiple times
            expect(attempts).toBeGreaterThan(100);

            // The result should be from the fallback value
            expect(result).toBeGreaterThanOrEqual(0.01);
            expect(result).toBeLessThanOrEqual(mean * 2);
        });

        it("should return a fallback value after many attempts", () => {
            let callCount = 0;
            vi.spyOn(randomUtil as any, "getSecureRandomNumber").mockImplementation(() => {
                // Alternate between u and v
                const value = callCount % 2 === 0 ? 0.0000001 : 0.5;
                callCount++;
                return value;
            });

            // Mock getFloat to return a predictable value
            vi.spyOn(randomUtil, "getFloat").mockReturnValue(7.77);

            const mean = 5;
            const sigma = 2;
            const result = randomUtil.getNormallyDistributedRandomNumber(mean, sigma, 101);

            expect(result).toBe(7.77);
        });
    });

    describe("randInt", () => {
        it("should return the same value when low and high are equal", () => {
            const result = randomUtil.randInt(5, 5);
            expect(result).toBe(5);
        });

        it("should work with float number parameters", () => {
            const result = randomUtil.randInt(5.5, 10.5);
            expect(result).toBeGreaterThanOrEqual(5);
            expect(result).toBeLessThan(11);
        });

        it("should log a debug message with float number parameters", () => {
            randomUtil.randInt(5.5, 10.5);
            expect(mockLogger.debug).toHaveBeenCalled();
        });

        it("should return an integer between low and high - 1", () => {
            const low = 5;
            const high = 10;
            const result = randomUtil.randInt(low, high);

            expect(result).toBeGreaterThanOrEqual(low);
            expect(result).toBeLessThan(high);
            expect(Number.isInteger(result)).toBe(true);
        });

        it("should return an integer between 0 and low - 1 when high is not provided", () => {
            const low = 5;
            const result = randomUtil.randInt(low);

            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThan(low);
            expect(Number.isInteger(result)).toBe(true);
        });

        it("should handle negative values", () => {
            const low = -10;
            const high = -5;
            const result = randomUtil.randInt(low, high);

            expect(result).toBeGreaterThanOrEqual(low);
            expect(result).toBeLessThan(high);
        });
    });

    describe("randNum", () => {
        it("should return the same value when low and high are equal", () => {
            const resultWithPrecision = randomUtil.randNum(5.555, 5.555);
            expect(resultWithPrecision).toBe(5.555);

            const resultNoPrecision = randomUtil.randNum(7, 7);
            expect(resultNoPrecision).toBe(7);
        });

        it("should not throw an error when precision is null", () => {
            expect(() => randomUtil.randNum(5, 10, null)).not.toThrow();
        });

        it("should throw when precision is a float or out of bounds", () => {
            const maxPrecision = (RandomUtil as any).MAX_PRECISION; // It's private.
            const expectedThrow = `randNum() parameter 'precision' must be a positive integer`;
            expect(() => randomUtil.randNum(5, 10, 0.5)).toThrowError(expectedThrow);
            expect(() => randomUtil.randNum(5, 10, -1)).toThrowError(expectedThrow);
        });

        it("should use the maximum precision of low and high when precision is null", () => {
            const result = randomUtil.randNum(5.123, 10.12345, null);
            expect(result.toString().split(".")[1]?.length || 0).toBeLessThanOrEqual(5); // Precision check.
        });

        it("should round to a whole number when precision is 0", () => {
            const result = randomUtil.randNum(5.123, 10.12345, 0);
            expect(result.toString().split(".")[1]?.length || 0).toBeLessThanOrEqual(0); // Precision check.
        });

        it("should correctly handle cases where high is less than low", () => {
            expect(() => randomUtil.randNum(10, 5)).not.toThrow();

            const result = randomUtil.randNum(10, 5);
            expect(result).toBeGreaterThanOrEqual(5);
            expect(result).toBeLessThanOrEqual(10);
        });

        it("should throw an error if low or high are not finite numbers", () => {
            const expectedThrow = "randNum() parameters 'value1' and 'value2' must be finite numbers";
            expect(() => randomUtil.randNum(Number.POSITIVE_INFINITY, 10)).toThrowError(expectedThrow);
            expect(() => randomUtil.randNum(5, Number.NaN)).toThrowError(expectedThrow);
        });

        it("should always return a value within the inclusive range of low and high", () => {
            for (let i = 0; i < 100; i++) {
                const result = randomUtil.randNum(5, 6);
                expect(result).toBeGreaterThanOrEqual(5);
                expect(result).toBeLessThanOrEqual(6);
            }
        });

        it("should return whole numbers when precision is 0", () => {
            const result = randomUtil.randNum(5, 10, 0);
            expect(result % 1).toBe(0); // Whole number check.
            expect(result).toBeGreaterThanOrEqual(5);
            expect(result).toBeLessThanOrEqual(10);
        });

        it("should throw when precision exceeds compatibility with double-precision arithmetic", () => {
            const expectedFirstThrow =
                "randNum() precision of 16 exceeds the allowable precision (15) for the given values";
            expect(() => randomUtil.randNum(0.1, 0.2, 16)).toThrowError(expectedFirstThrow);

            const expectedSecondThrow =
                "randNum() precision of 12 exceeds the allowable precision (11) for the given values";
            expect(() => randomUtil.randNum(1234.1, 1234.2, 12)).toThrowError(expectedSecondThrow);
        });

        it("should default high to low when high is not provided", () => {
            const result = randomUtil.randNum(1);
            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThanOrEqual(1);
        });

        it("should handle negative ranges correctly", () => {
            const result = randomUtil.randNum(-10, -5);
            expect(result).toBeGreaterThanOrEqual(-10);
            expect(result).toBeLessThanOrEqual(-5);
        });

        it("should handle very large numbers correctly", () => {
            const result = randomUtil.randNum(1e10, 1e10 + 1);
            expect(result).toBeGreaterThanOrEqual(1e10);
            expect(result).toBeLessThanOrEqual(1e10 + 1);
        });

        it("should consistently generate valid results over many iterations", () => {
            for (let i = 0; i < 5000; i++) {
                const result = randomUtil.randNum(1, 2, 3);
                expect(result).toBeGreaterThanOrEqual(1);
                expect(result).toBeLessThanOrEqual(2);
                expect(result.toString().split(".")[1]?.length || 0).toBeLessThanOrEqual(3); // Precision check
            }
        });
    });

    describe("drawRandomFromList", () => {
        it("should draw elements with replacement", () => {
            const list = [1, 2, 3, 4, 5];
            const count = 3;
            const result = randomUtil.drawRandomFromList(list, count, true);

            expect(result.length).toBe(count);
            for (const item of result) {
                expect(list).toContain(item);
            }
        });

        it("should draw elements without replacement", () => {
            mockCloner.clone.mockImplementation((obj) => [...obj]);

            const list = [1, 2, 3, 4, 5];
            const count = 3;
            const result = randomUtil.drawRandomFromList(list, count, false);

            expect(result.length).toBe(count);
            expect(new Set(result).size).toBe(count);
        });

        it("should clone the original list when drawing without replacement", () => {
            const list = [1, 2, 3];
            randomUtil.drawRandomFromList(list, 2, false);

            expect(mockCloner.clone).toHaveBeenCalledWith(list);
        });

        it("should handle count greater than list length without replacement", () => {
            const list = [1, 2, 3];
            const count = 5;
            const result = randomUtil.drawRandomFromList(list, count, false);

            expect(result.length).toBe(3);
        });

        it("should adjust count when count exceeds list length without replacement", () => {
            const list = [10, 20, 30];
            const count = 4; // Count exceeds list length
            const result = randomUtil.drawRandomFromList(list, count, false);

            // The result should contain all elements from the list without duplicates
            expect(result.length).toBe(3); // Should be adjusted to list length
            expect(new Set(result).size).toBe(3);

            // Ensure that the result contains all elements from the original list
            expect(result.sort()).toEqual(list.sort());
        });
    });

    describe("drawRandomFromDict", () => {
        it("should draw keys from the dictionary with replacement", () => {
            const dict = { a: 1, b: 2, c: 3 };
            const count = 2;
            const result = randomUtil.drawRandomFromDict(dict, count, true);

            expect(result.length).toBe(count);
            for (const key of result) {
                expect(Object.keys(dict)).toContain(key);
            }
        });

        it("should draw keys without replacement", () => {
            const dict = { a: 1, b: 2, c: 3 };
            const count = 2;
            const result = randomUtil.drawRandomFromDict(dict, count, false);

            expect(result.length).toBe(count);
            expect(new Set(result).size).toBe(count);
        });

        it("should handle single-key dictionaries", () => {
            const dict = { onlyKey: 1 };
            const count = 2;
            const result = randomUtil.drawRandomFromDict(dict, count, false);

            expect(result.length).toBe(1);
            expect(result).toEqual(["onlyKey"]);
        });

        it("should handle dictionaries with integer keys", () => {
            const dict = { 1: "a", 2: "b", 3: "c" };
            const count = 2;
            const result = randomUtil.drawRandomFromDict(dict, count, false);

            expect(result.length).toBe(count);
            for (const key of result) {
                expect(Object.keys(dict)).toContain(key);
            }
        });

        it("should handle count greater than number of keys without replacement", () => {
            const dict = { a: 1, b: 2 };
            const count = 3;
            const result = randomUtil.drawRandomFromDict(dict, count, false);

            expect(result.length).toBe(2);
        });

        it("should adjust count when count exceeds number of keys without replacement", () => {
            const dict = { a: 1, b: 2, c: 3 };
            const count = 5; // Count exceeds number of keys
            const result = randomUtil.drawRandomFromDict(dict, count, false);

            // The result should contain all keys without duplicates
            expect(result.length).toBe(3); // Should be adjusted to number of keys
            expect(new Set(result).size).toBe(3);

            // Ensure that the result contains all keys from the dictionary
            const dictKeys = Object.keys(dict);
            expect(result.sort()).toEqual(dictKeys.sort());
        });
    });

    describe("getBiasedRandomNumber", () => {
        it("should return a number within the range", () => {
            const min = 1;
            const max = 10;
            const shift = 2;
            const n = 2;
            const result = randomUtil.getBiasedRandomNumber(min, max, shift, n);

            expect(result).toBeGreaterThanOrEqual(min);
            expect(result).toBeLessThanOrEqual(max);
        });

        it("should throw error when max < min", () => {
            expect(() => randomUtil.getBiasedRandomNumber(10, 5, 0, 2)).toThrowError(
                "Bounded random number generation max is smaller than min (5 < 10)",
            );
        });

        it("should throw error when n < 1", () => {
            expect(() => randomUtil.getBiasedRandomNumber(1, 10, 0, 0)).toThrowError(
                "'n' must be 1 or greater (received 0)",
            );
        });

        it("should log warning when shift is greater than range", () => {
            const min = 1;
            const max = 5;
            const shift = 10;
            const n = 2;
            randomUtil.getBiasedRandomNumber(min, max, shift, n);

            expect(mockLogger.warning).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(`min -> ${min}; max -> ${max}; shift -> ${shift}`);
        });

        it("should return predictable result when getSecureRandomNumber is mocked", () => {
            vi.spyOn(randomUtil as any, "getSecureRandomNumber").mockReturnValue(0.5);

            const min = 1;
            const max = 10;
            const shift = 0;
            const n = 2; // n affects how many times getSecureRandomNumber is summed/averaged

            // With getSecureRandomNumber always returning 0.5,
            // gaussianRandom(n) = 0.5 no matter what
            // boundedGaussian(start, end, n) = round(start + 0.5 * (end - start + 1))

            // For shift = 0:
            // biasedMin = min = 1
            // biasedMax = max = 10
            // boundedGaussian(1, 10, 2) = round(1 + 0.5*(10 - 1 + 1)) = round(1 + 0.5*10) = round(1+5) = 6

            // The loop ensures num is within [min, max], and since 6 is within [1,10], it returns 6 immediately.
            const result = randomUtil.getBiasedRandomNumber(min, max, shift, n);

            expect(result).toBe(6);
        });
    });

    describe("shuffle", () => {
        it("should shuffle the array", () => {
            const array = [1, 2, 3, 4, 5];
            const shuffled = randomUtil.shuffle([...array]);

            expect(shuffled).toHaveLength(array.length);
            expect(shuffled).not.toEqual(array);
            expect(shuffled.sort()).toEqual(array.sort());
        });

        it("should handle empty arrays", () => {
            const array: any[] = [];
            const shuffled = randomUtil.shuffle(array);

            expect(shuffled).toEqual([]);
        });

        it("should return the same array when array length is 1", () => {
            const array = [1];
            const shuffled = randomUtil.shuffle(array);

            expect(shuffled).toEqual([1]);
        });
    });

    describe("rollForChanceProbability", () => {
        it("should return true when rolled chance is less than or equal to probabilityChance", () => {
            vi.spyOn(randomUtil as any, "getSecureRandomNumber").mockReturnValue(0.5);

            const probabilityChance = 0.6;
            const result = randomUtil.rollForChanceProbability(probabilityChance);

            expect(result).toBe(true);
        });

        it("should return false when rolled chance is greater than probabilityChance", () => {
            vi.spyOn(randomUtil as any, "getSecureRandomNumber").mockReturnValue(0.7);

            const probabilityChance = 0.6;
            const result = randomUtil.rollForChanceProbability(probabilityChance);

            expect(result).toBe(false);
        });

        it("should handle probabilityChance of 0", () => {
            vi.spyOn(randomUtil as any, "getSecureRandomNumber").mockReturnValue(0.1);

            const probabilityChance = 0;
            const result = randomUtil.rollForChanceProbability(probabilityChance);

            expect(result).toBe(false);
        });

        it("should handle probabilityChance of 1", () => {
            vi.spyOn(randomUtil as any, "getSecureRandomNumber").mockReturnValue(0.99);

            const probabilityChance = 1;
            const result = randomUtil.rollForChanceProbability(probabilityChance);

            expect(result).toBe(true);
        });
    });
});
