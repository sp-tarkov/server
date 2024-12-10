import * as crypto from "node:crypto";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { MathUtil } from "@spt/utils/MathUtil";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

/**
 * Array of ProbabilityObjectArray which allow to randomly draw of the contained objects
 * based on the relative probability of each of its elements.
 * The probabilities of the contained element is not required to be normalized.
 *
 * Example:
 *   po = new ProbabilityObjectArray(
 *          new ProbabilityObject("a", 5),
 *          new ProbabilityObject("b", 1),
 *          new ProbabilityObject("c", 1)
 *   );
 *   res = po.draw(10000);
 *   // count the elements which should be distributed according to the relative probabilities
 *   res.filter(x => x==="b").reduce((sum, x) => sum + 1 , 0)
 */
export class ProbabilityObjectArray<K, V = undefined> extends Array<ProbabilityObject<K, V>> {
    constructor(
        private mathUtil: MathUtil,
        private cloner: ICloner,
        ...items: ProbabilityObject<K, V>[]
    ) {
        super();
        this.push(...items);
    }

    filter(
        callbackfn: (value: ProbabilityObject<K, V>, index: number, array: ProbabilityObject<K, V>[]) => any,
    ): ProbabilityObjectArray<K, V> {
        return new ProbabilityObjectArray(this.mathUtil, this.cloner, ...super.filter(callbackfn));
    }

    /**
     * Calculates the normalized cumulative probability of the ProbabilityObjectArray's elements normalized to 1
     * @param       {array}                         probValues              The relative probability values of which to calculate the normalized cumulative sum
     * @returns     {array}                                                 Cumulative Sum normalized to 1
     */
    cumulativeProbability(probValues: number[]): number[] {
        const sum = this.mathUtil.arraySum(probValues);
        let probCumsum = this.mathUtil.arrayCumsum(probValues);
        probCumsum = this.mathUtil.arrayProd(probCumsum, 1 / sum);
        return probCumsum;
    }

    /**
     * Clone this ProbabilitObjectArray
     * @returns     {ProbabilityObjectArray}                                Deep Copy of this ProbabilityObjectArray
     */
    clone(): ProbabilityObjectArray<K, V> {
        const clone = this.cloner.clone(this);
        const probabliltyObjects = new ProbabilityObjectArray<K, V>(this.mathUtil, this.cloner);
        for (const ci of clone) {
            probabliltyObjects.push(new ProbabilityObject(ci.key, ci.relativeProbability, ci.data));
        }
        return probabliltyObjects;
    }

    /**
     * Drop an element from the ProbabilityObjectArray
     *
     * @param       {string}                        key                     The key of the element to drop
     * @returns     {ProbabilityObjectArray}                                ProbabilityObjectArray without the dropped element
     */
    drop(key: K): ProbabilityObjectArray<K, V> {
        return this.filter((r) => r.key !== key);
    }

    /**
     * Return the data field of a element of the ProbabilityObjectArray
     * @param       {string}                        key                     The key of the element whose data shall be retrieved
     * @returns     {object}                                                The data object
     */
    data(key: K): V | undefined {
        return this.filter((r) => r.key === key)[0]?.data;
    }

    /**
     * Get the relative probability of an element by its key
     *
     * Example:
     *  po = new ProbabilityObjectArray(new ProbabilityObject("a", 5), new ProbabilityObject("b", 1))
     *  po.maxProbability() // returns 5
     *
     * @param       {string}                        key                     The key of the element whose relative probability shall be retrieved
     * @return      {number}                                                The relative probability
     */
    probability(key: K): number {
        return this.filter((r) => r.key === key)[0].relativeProbability;
    }

    /**
     * Get the maximum relative probability out of a ProbabilityObjectArray
     *
     * Example:
     *  po = new ProbabilityObjectArray(new ProbabilityObject("a", 5), new ProbabilityObject("b", 1))
     *  po.maxProbability() // returns 5
     *
     * @return      {number}                                                the maximum value of all relative probabilities in this ProbabilityObjectArray
     */
    maxProbability(): number {
        return Math.max(...this.map((x) => x.relativeProbability));
    }

    /**
     * Get the minimum relative probability out of a ProbabilityObjectArray
     *
     * Example:
     *  po = new ProbabilityObjectArray(new ProbabilityObject("a", 5), new ProbabilityObject("b", 1))
     *  po.minProbability() // returns 1
     *
     * @return      {number}                                                the minimum value of all relative probabilities in this ProbabilityObjectArray
     */
    minProbability(): number {
        return Math.min(...this.map((x) => x.relativeProbability));
    }

    /**
     * Draw random element of the ProbabilityObject N times to return an array of N keys.
     * Drawing can be with or without replacement
     * @param count The number of times we want to draw
     * @param replacement Draw with or without replacement from the input dict (true = dont remove after drawing)
     * @param locklist list keys which shall be replaced even if drawing without replacement
     * @returns Array consisting of N random keys for this ProbabilityObjectArray
     */
    public draw(count = 1, replacement = true, locklist: Array<K> = []): K[] {
        if (this.length === 0) {
            return [];
        }

        const { probArray, keyArray } = this.reduce(
            (acc, x) => {
                acc.probArray.push(x.relativeProbability);
                acc.keyArray.push(x.key);
                return acc;
            },
            { probArray: new Array<number>(), keyArray: new Array<K>() },
        );
        let probCumsum = this.cumulativeProbability(probArray);

        const drawnKeys: K[] = [];
        for (let i = 0; i < count; i++) {
            const rand = Math.random();
            const randomIndex = probCumsum.findIndex((x) => x > rand);
            // We cannot put Math.random() directly in the findIndex because then it draws anew for each of its iteration
            if (replacement || locklist.includes(keyArray[randomIndex])) {
                // Add random item from possible value into return array
                drawnKeys.push(keyArray[randomIndex]);
            } else {
                // We draw without replacement -> remove the key and its probability from array
                const key = keyArray.splice(randomIndex, 1)[0];
                probArray.splice(randomIndex, 1);
                drawnKeys.push(key);
                probCumsum = this.cumulativeProbability(probArray);
                // If we draw without replacement and the ProbabilityObjectArray is exhausted we need to break
                if (keyArray.length < 1) {
                    break;
                }
            }
        }

        return drawnKeys;
    }
}

/**
 * A ProbabilityObject which is use as an element to the ProbabilityObjectArray array
 * It contains a key, the relative probability as well as optional data.
 */
export class ProbabilityObject<K, V = undefined> {
    key: K;
    relativeProbability: number;
    data?: V;
    /**
     * Constructor for the ProbabilityObject
     * @param       {string}                        key                         The key of the element
     * @param       {number}                        relativeProbability         The relative probability of this element
     * @param       {any}                           data                        Optional data attached to the element
     */
    constructor(key: K, relativeProbability: number, data?: V) {
        this.key = key;
        this.relativeProbability = relativeProbability;
        this.data = data;
    }
}

@injectable()
export class RandomUtil {
    constructor(
        @inject("PrimaryCloner") protected cloner: ICloner,
        @inject("PrimaryLogger") protected logger: ILogger,
    ) {}

    /**
     * The IEEE-754 standard for double-precision floating-point numbers limits the number of digits (including both
     * integer + fractional parts) to about 15–17 significant digits. 15 is a safe upper bound, so we'll use that.
     */
    private static readonly MAX_SIGNIFICANT_DIGITS = 15;

    /**
     * Generates a secure random number between 0 (inclusive) and 1 (exclusive).
     *
     * This method uses the `crypto` module to generate a 48-bit random integer,
     * which is then divided by the maximum possible 48-bit integer value to
     * produce a floating-point number in the range [0, 1).
     *
     * @returns A secure random number between 0 (inclusive) and 1 (exclusive).
     */
    private getSecureRandomNumber(): number {
        const buffer = crypto.randomBytes(6); // 48 bits
        const integer = buffer.readUIntBE(0, 6);
        const maxInteger = 281474976710656; // 2^48
        return integer / maxInteger;
    }

    /**
     * Determines the number of decimal places in a number.
     *
     * @param num - The number to analyze.
     * @returns The number of decimal places, or 0 if none exist.
     * @remarks There is a mathematical way to determine this, but it's not as simple as it seams due to floating point
     *          precision issues. This method is a simple workaround that converts the number to a string and splits it.
     *          It's not the most efficient but it *is* the most reliable and easy to understand. Come at me.
     */
    private getNumberPrecision(num: number): number {
        return num.toString().split(".")[1]?.length || 0;
    }

    /**
     * Generates a random integer between the specified minimum and maximum values, inclusive.
     *
     * @param min - The minimum value (inclusive).
     * @param max - The maximum value (inclusive).
     * @returns A random integer between the specified minimum and maximum values.
     */
    public getInt(min: number, max: number): number {
        const minimum = Math.ceil(min);
        const maximum = Math.floor(max);
        if (maximum > minimum) {
            // randomInt is exclusive of the max value, so add 1
            return crypto.randomInt(minimum, maximum + 1);
        }
        return minimum;
    }

    /**
     * Generates a random integer between 1 (inclusive) and the specified maximum value (exclusive).
     * If the maximum value is less than or equal to 1, it returns 1.
     *
     * @param max - The upper bound (exclusive) for the random integer generation.
     * @returns A random integer between 1 and max - 1, or 1 if max is less than or equal to 1.
     */
    public getIntEx(max: number): number {
        return max > 2 ? crypto.randomInt(1, max - 1) : 1;
    }

    /**
     * Generates a random floating-point number within the specified range.
     *
     * @param min - The minimum value of the range (inclusive).
     * @param max - The maximum value of the range (exclusive).
     * @returns A random floating-point number between `min` (inclusive) and `max` (exclusive).
     */
    public getFloat(min: number, max: number): number {
        const random = this.getSecureRandomNumber();
        return random * (max - min) + min;
    }

    /**
     * Generates a random boolean value.
     *
     * @returns A random boolean value, where the probability of `true` and `false` is approximately equal.
     */
    public getBool(): boolean {
        const random = this.getSecureRandomNumber();
        return random < 0.5;
    }

    /**
     * Calculates the percentage of a given number and returns the result.
     *
     * @param percent - The percentage to calculate.
     * @param number - The number to calculate the percentage of.
     * @param toFixed - The number of decimal places to round the result to (default is 2).
     * @returns The calculated percentage of the given number, rounded to the specified number of decimal places.
     */
    public getPercentOfValue(percent: number, number: number, toFixed = 2): number {
        return Number.parseFloat(((percent * number) / 100).toFixed(toFixed));
    }

    /**
     * Reduces a given number by a specified percentage.
     *
     * @param number - The original number to be reduced.
     * @param percentage - The percentage by which to reduce the number.
     * @returns The reduced number after applying the percentage reduction.
     */
    public reduceValueByPercent(number: number, percentage: number): number {
        const reductionAmount = number * (percentage / 100);
        return number - reductionAmount;
    }

    /**
     * Determines if a random event occurs based on the given chance percentage.
     *
     * @param chancePercent - The percentage chance (0-100) that the event will occur.
     * @returns `true` if the event occurs, `false` otherwise.
     */
    public getChance100(chancePercent: number): boolean {
        return this.getIntEx(100) <= chancePercent;
    }

    /**
     * Returns a random string from the provided array of strings.
     *
     * This method is separate from getArrayValue so we can use a generic inference with getArrayValue.
     *
     * @param arr - The array of strings to select a random value from.
     * @returns A randomly selected string from the array.
     */
    public getStringArrayValue(arr: string[]): string {
        return arr[this.getInt(0, arr.length - 1)];
    }

    /**
     * Returns a random element from the provided array.
     *
     * @template T - The type of elements in the array.
     * @param arr - The array from which to select a random element.
     * @returns A random element from the array.
     */
    public getArrayValue<T>(arr: T[]): T {
        return arr[this.getInt(0, arr.length - 1)];
    }

    /**
     * Retrieves a random key from the given object.
     *
     * @param node - The object from which to retrieve a key.
     * @returns A string representing one of the keys of the node object.
     *
     * TODO: v3.11 - This method is not type-safe and should be refactored to use a more specific type:
     *               https://github.com/sp-tarkov/server/pull/972/commits/f2b8efe211d95f71aec0a4bc84f4542335433412
     */
    // biome-ignore lint/suspicious/noExplicitAny: Used to allow for a broad range of types.
    public getKey(node: any): string {
        return this.getArrayValue(Object.keys(node));
    }

    /**
     * Retrieves the value associated with a key from the given node object.
     *
     * @param node - An object with string keys and any type of values.
     * @returns The value associated with the key obtained from the node.
     *
     * TODO: v3.11 - This method is not type-safe and should be refactored to use a more specific type:
     *               https://github.com/sp-tarkov/server/pull/972/commits/f2b8efe211d95f71aec0a4bc84f4542335433412
     */
    // biome-ignore lint/suspicious/noExplicitAny: Used to allow for a broad range of types.
    public getKeyValue(node: { [x: string]: any }): any {
        return node[this.getKey(node)];
    }

    /**
     * Generates a normally distributed random number using the Box-Muller transform.
     *
     * @param mean - The mean (μ) of the normal distribution.
     * @param sigma - The standard deviation (σ) of the normal distribution.
     * @param attempt - The current attempt count to generate a valid number (default is 0).
     * @returns A normally distributed random number.
     *
     * @remarks
     * This function uses the Box-Muller transform to generate a normally distributed random number.
     * If the generated number is less than 0, it will recursively attempt to generate a valid number up to 100 times.
     * If it fails to generate a valid number after 100 attempts, it will return a random float between 0.01 and twice the mean.
     */
    public getNormallyDistributedRandomNumber(mean: number, sigma: number, attempt = 0): number {
        let u = 0;
        let v = 0;
        while (u === 0) {
            u = this.getSecureRandomNumber();
        }
        while (v === 0) {
            v = this.getSecureRandomNumber();
        }
        const w = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        const valueDrawn = mean + w * sigma;
        if (valueDrawn < 0) {
            if (attempt > 100) {
                return this.getFloat(0.01, mean * 2);
            }

            return this.getNormallyDistributedRandomNumber(mean, sigma, attempt + 1);
        }

        return valueDrawn;
    }

    /**
     * Generates a random integer between the specified range.
     * Low and high parameters are floored to integers.
     *
     * TODO: v3.11 - This method should not accept non-integer numbers.
     *
     * @param low - The lower bound of the range (inclusive).
     * @param high - The upper bound of the range (exclusive). If not provided, the range will be from 0 to `low`.
     * @returns A random integer within the specified range.
     */
    public randInt(low: number, high?: number): number {
        let randomLow = low;
        let randomHigh = high;

        // Detect if either of the parameters is a float, and log a warning
        if (low % 1 !== 0 || (typeof high !== "undefined" && high % 1 !== 0)) {
            this.logger.debug(
                "Deprecated: RandomUtil.randInt() called with float input. Use RandomUtil.randNum() instead.",
            );
            // Round the float values to the nearest integer. Eww!
            randomLow = Math.floor(low);
            if (typeof high !== "undefined") {
                randomHigh = Math.floor(high);
            }
        }

        // Return a random integer from 0 to low if high is not provided
        if (typeof high === "undefined") {
            return crypto.randomInt(0, randomLow);
        }

        // Return low directly when low and high are equal
        if (low === high) {
            return randomLow;
        }

        return crypto.randomInt(randomLow, randomHigh);
    }

    /**
     * Generates a random number between two given values with optional precision.
     *
     * @param value1 - The first value to determine the range.
     * @param value2 - The second value to determine the range. If not provided, 0 is used.
     * @param precision - The number of decimal places to round the result to. Must be a positive integer between 0
     *                    and MAX_PRECISION, inclusive. If not provided, precision is determined by the input values.
     * @returns A random floating-point number between `value1` and `value2` (inclusive) with the specified precision.
     * @throws Will throw an error if `precision` is not a positive integer, if `value1` or `value2` are not finite
     *         numbers, or if the precision exceeds the maximum allowed for the given values.
     */
    public randNum(value1: number, value2 = 0, precision: number | null = null): number {
        if (!Number.isFinite(value1) || !Number.isFinite(value2)) {
            throw new Error("randNum() parameters 'value1' and 'value2' must be finite numbers");
        }

        // Determine the range by finding the min and max of the provided values
        const min = Math.min(value1, value2);
        const max = Math.max(value1, value2);

        // Validate and adjust precision
        if (precision !== null) {
            if (!Number.isInteger(precision) || precision < 0) {
                throw new Error(`randNum() parameter 'precision' must be a positive integer`);
            }

            // Calculate the number of whole-number digits in the maximum absolute value of the range
            const maxAbsoluteValue = Math.max(Math.abs(min), Math.abs(max));
            const wholeNumberDigits = Math.floor(Math.log10(maxAbsoluteValue)) + 1;

            // Determine the maximum allowable precision--The number of decimal places that can be used without losing
            // precision due to the number of bits available in a double-precision floating-point number
            const maxAllowedPrecision = Math.max(0, RandomUtil.MAX_SIGNIFICANT_DIGITS - wholeNumberDigits);

            // Throw if the requested precision exceeds the maximum
            if (precision > maxAllowedPrecision) {
                throw new Error(
                    `randNum() precision of ${precision} exceeds the allowable precision (${maxAllowedPrecision}) for the given values`,
                );
            }
        }

        // Generate a random number within a specified range
        const random = this.getSecureRandomNumber();
        const result = random * (max - min) + min;

        // Determine the maximum precision to use for rounding the result
        const maxPrecision = Math.max(this.getNumberPrecision(value1), this.getNumberPrecision(value2));
        const effectivePrecision = precision ?? maxPrecision;

        // Calculate the factor to use for rounding the result to the specified precision
        const factor = 10 ** effectivePrecision;

        return Math.round(result * factor) / factor;
    }

    /**
     * Draws a specified number of random elements from a given list.
     *
     * @template T - The type of elements in the list.
     * @param originalList - The list to draw elements from.
     * @param count - The number of elements to draw. Defaults to 1.
     * @param replacement - Whether to draw with replacement. Defaults to true.
     * @returns An array containing the drawn elements.
     */
    public drawRandomFromList<T>(originalList: Array<T>, count = 1, replacement = true): Array<T> {
        let list = originalList;
        let drawCount = count;

        if (!replacement) {
            list = this.cloner.clone(originalList);
            // Adjust drawCount to avoid drawing more elements than available
            if (drawCount > list.length) {
                drawCount = list.length;
            }
        }

        const results: T[] = [];
        for (let i = 0; i < drawCount; i++) {
            const randomIndex = this.randInt(list.length);
            if (replacement) {
                results.push(list[randomIndex]);
            } else {
                results.push(list.splice(randomIndex, 1)[0]);
            }
        }
        return results;
    }

    /**
     * Draws a specified number of random keys from a given dictionary.
     *
     * @param dict - The dictionary from which to draw keys.
     * @param count - The number of keys to draw. Defaults to 1.
     * @param replacement - Whether to draw with replacement. Defaults to true.
     * @returns An array of randomly drawn keys from the dictionary.
     *
     * TODO: v3.11 - This method is not type-safe and should be refactored to use a more specific type:
     *               https://github.com/sp-tarkov/server/pull/972/commits/f2b8efe211d95f71aec0a4bc84f4542335433412
     */
    // biome-ignore lint/suspicious/noExplicitAny: Used to allow for a broad range of types.
    public drawRandomFromDict(dict: any, count = 1, replacement = true): any[] {
        const keys = Object.keys(dict);
        const randomKeys = this.drawRandomFromList(keys, count, replacement);
        return randomKeys;
    }

    /**
     * Generates a biased random number within a specified range.
     *
     * @param min - The minimum value of the range (inclusive).
     * @param max - The maximum value of the range (inclusive).
     * @param shift - The bias shift to apply to the random number generation.
     * @param n - The number of iterations to use for generating a Gaussian random number.
     * @returns A biased random number within the specified range.
     * @throws Will throw if `max` is less than `min` or if `n` is less than 1.
     */
    public getBiasedRandomNumber(min: number, max: number, shift: number, n: number): number {
        /**
         * This function generates a random number based on a gaussian distribution with an option to add a bias via shifting.
         *
         * Here's an example graph of how the probabilities can be distributed:
         * https://www.boost.org/doc/libs/1_49_0/libs/math/doc/sf_and_dist/graphs/normal_pdf.png
         *
         * Our parameter 'n' is sort of like σ (sigma) in the example graph.
         *
         * An 'n' of 1 means all values are equally likely. Increasing 'n' causes numbers near the edge to become less likely.
         * By setting 'shift' to whatever 'max' is, we can make values near 'min' very likely, while values near 'max' become extremely unlikely.
         *
         * Here's a place where you can play around with the 'n' and 'shift' values to see how the distribution changes:
         * http://jsfiddle.net/e08cumyx/
         */
        if (max < min) {
            throw {
                name: "Invalid arguments",
                message: `Bounded random number generation max is smaller than min (${max} < ${min})`,
            };
        }

        if (n < 1) {
            throw { name: "Invalid argument", message: `'n' must be 1 or greater (received ${n})` };
        }

        if (min === max) {
            return min;
        }

        if (shift > max - min) {
            /**
             * If a rolled number is out of bounds (due to bias being applied), we simply roll it again.
             * As the shifting increases, the chance of rolling a number within bounds decreases.
             * A shift that is equal to the available range only has a 50% chance of rolling correctly, theoretically halving performance.
             * Shifting even further drops the success chance very rapidly - so we want to warn against that
             **/
            this.logger.warning(
                "Bias shift for random number generation is greater than the range of available numbers. This can have a very severe performance impact!",
            );
            this.logger.info(`min -> ${min}; max -> ${max}; shift -> ${shift}`);
        }

        const gaussianRandom = (n: number) => {
            let rand = 0;

            for (let i = 0; i < n; i += 1) {
                rand += this.getSecureRandomNumber();
            }

            return rand / n;
        };

        const boundedGaussian = (start: number, end: number, n: number) => {
            return Math.round(start + gaussianRandom(n) * (end - start + 1));
        };

        const biasedMin = shift >= 0 ? min - shift : min;
        const biasedMax = shift < 0 ? max + shift : max;

        let num: number;
        do {
            num = boundedGaussian(biasedMin, biasedMax, n);
        } while (num < min || num > max);

        return num;
    }

    /**
     * Shuffles an array in place using the Fisher-Yates algorithm.
     *
     * @template T - The type of elements in the array.
     * @param array - The array to shuffle.
     * @returns The shuffled array.
     */
    public shuffle<T>(array: Array<T>): Array<T> {
        let currentIndex = array.length;
        let randomIndex: number;

        // While there remain elements to shuffle.
        while (currentIndex !== 0) {
            // Pick a remaining element.
            randomIndex = crypto.randomInt(0, currentIndex);
            currentIndex--;

            // And swap it with the current element.
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }

        return array;
    }

    /**
     * Rolls for a chance probability and returns whether the roll is successful.
     *
     * @param probabilityChance - The probability chance to roll for, represented as a number between 0 and 1.
     * @returns `true` if the random number is less than or equal to the probability chance, otherwise `false`.
     */
    public rollForChanceProbability(probabilityChance: number): boolean {
        const random = this.getSecureRandomNumber();
        return random <= probabilityChance;
    }
}
