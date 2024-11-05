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

    public getInt(min: number, max: number): number {
        const minimum = Math.ceil(min);
        const maximum = Math.floor(max);
        return maximum > minimum ? Math.floor(Math.random() * (maximum - minimum + 1) + minimum) : minimum;
    }

    public getIntEx(max: number): number {
        return max > 1 ? Math.floor(Math.random() * (max - 2) + 1) : 1;
    }

    public getFloat(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    }

    public getBool(): boolean {
        return Math.random() < 0.5;
    }

    public getPercentOfValue(percent: number, number: number, toFixed = 2): number {
        return Number.parseFloat(((percent * number) / 100).toFixed(toFixed));
    }

    /**
     * Reduce a value by a percentage
     * @param number Value to reduce
     * @param percentage Percentage to reduce value by
     * @returns Reduced value
     */
    public reduceValueByPercent(number: number, percentage: number): number {
        const reductionAmount = number * (percentage / 100);
        return number - reductionAmount;
    }

    /**
     * Check if number passes a check out of 100
     * @param chancePercent value check needs to be above
     * @returns true if value passes check
     */
    public getChance100(chancePercent: number): boolean {
        return this.getIntEx(100) <= chancePercent;
    }

    // Its better to keep this method separated from getArrayValue so we can use generic inferance on getArrayValue
    public getStringArrayValue(arr: string[]): string {
        return arr[this.getInt(0, arr.length - 1)];
    }

    public getArrayValue<T>(arr: T[]): T {
        return arr[this.getInt(0, arr.length - 1)];
    }

    public getKey(node: any): string {
        return this.getArrayValue(Object.keys(node));
    }

    public getKeyValue(node: { [x: string]: any }): any {
        return node[this.getKey(node)];
    }

    /**
     * Generate a normally distributed random number
     * Uses the Box-Muller transform
     * @param   {number}    mean    Mean of the normal distribution
     * @param   {number}    sigma   Standard deviation of the normal distribution
     * @returns {number}            The value drawn
     */
    public getNormallyDistributedRandomNumber(mean: number, sigma: number, attempt = 0): number {
        let u = 0;
        let v = 0;
        while (u === 0) {
            u = Math.random(); // Converting [0,1) to (0,1)
        }
        while (v === 0) {
            v = Math.random();
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
     * Draw Random integer low inclusive, high exclusive
     * if high is not set we draw from 0 to low (exclusive)
     * @param   {integer}   low     Lower bound inclusive, when high is not set, this is high
     * @param   {integer}   high    Higher bound exclusive
     * @returns {integer}           The random integer in [low, high)
     */
    public randInt(low: number, high?: number): number {
        if (high) {
            return low + Math.floor(Math.random() * (high - low));
        }

        return Math.floor(Math.random() * low);
    }

    /**
     * Draw a random element of the provided list N times to return an array of N random elements
     * Drawing can be with or without replacement
     * @param   {array}     list            The array we want to draw randomly from
     * @param   {integer}   count           The number of times we want to draw
     * @param   {boolean}   replacement     Draw with or without replacement from the input array(default true)
     * @return  {array}                     Array consisting of N random elements
     */
    public drawRandomFromList<T>(originalList: Array<T>, count = 1, replacement = true): Array<T> {
        let list = originalList;
        if (!replacement) {
            list = this.cloner.clone(originalList);
        }

        const results: T[] = [];
        for (let i = 0; i < count; i++) {
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
     * Draw a random (top level) element of the provided dictionary N times to return an array of N random dictionary keys
     * Drawing can be with or without replacement
     * @param   {any}       dict            The dictionary we want to draw randomly from
     * @param   {integer}   count           The number of times we want to draw
     * @param   {boolean}   replacement     Draw with ot without replacement from the input dict
     * @return  {array}                     Array consisting of N random keys of the dictionary
     */
    public drawRandomFromDict(dict: any, count = 1, replacement = true): any[] {
        const keys = Object.keys(dict);
        const randomKeys = this.drawRandomFromList(keys, count, replacement);
        return randomKeys;
    }

    public getBiasedRandomNumber(min: number, max: number, shift: number, n: number): number {
        /* To whoever tries to make sense of this, please forgive me - I tried my best at explaining what goes on here.
         * This function generates a random number based on a gaussian distribution with an option to add a bias via shifting.
         *
         * Here's an example graph of how the probabilities can be distributed:
         * https://www.boost.org/doc/libs/1_49_0/libs/math/doc/sf_and_dist/graphs/normal_pdf.png
         * Our parameter 'n' is sort of like σ (sigma) in the example graph.
         *
         * An 'n' of 1 means all values are equally likely. Increasing 'n' causes numbers near the edge to become less likely.
         * By setting 'shift' to whatever 'max' is, we can make values near 'min' very likely, while values near 'max' become extremely unlikely.
         *
         * Here's a place where you can play around with the 'n' and 'shift' values to see how the distribution changes:
         * http://jsfiddle.net/e08cumyx/ */

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
            /* If a rolled number is out of bounds (due to bias being applied), we simply roll it again.
             * As the shifting increases, the chance of rolling a number within bounds decreases.
             * A shift that is equal to the available range only has a 50% chance of rolling correctly, theoretically halving performance.
             * Shifting even further drops the success chance very rapidly - so we want to warn against that */

            this.logger.warning(
                "Bias shift for random number generation is greater than the range of available numbers.\nThis can have a very severe performance impact!",
            );
            this.logger.info(`min -> ${min}; max -> ${max}; shift -> ${shift}`);
        }

        const gaussianRandom = (n: number) => {
            let rand = 0;

            for (let i = 0; i < n; i += 1) {
                rand += Math.random();
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
     * Fisher-Yates shuffle an array
     * @param array Array to shuffle
     * @returns Shuffled array
     */
    public shuffle<T>(array: Array<T>): Array<T> {
        let currentIndex = array.length;
        let randomIndex: number;

        // While there remain elements to shuffle.
        while (currentIndex !== 0) {
            // Pick a remaining element.
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;

            // And swap it with the current element.
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }

        return array;
    }

    /**
     * Rolls for a probability based on chance
     * @param number Probability Chance as float (0-1)
     * @returns If roll succeed or not
     * @example
     * rollForChanceProbability(0.25); // returns true 25% probability
     */
    public rollForChanceProbability(probabilityChance: number): boolean {
        const maxRoll = 9999;

        // Roll a number between 0 and 1
        const rolledChance = this.getInt(0, maxRoll) / 10000;

        return rolledChance <= probabilityChance;
    }
}
