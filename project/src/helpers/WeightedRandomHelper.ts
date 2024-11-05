import { injectable } from "tsyringe";

@injectable()
export class WeightedRandomHelper {
    /**
     * Choos an item from the passed in array based on the weightings of each
     * @param itemArray Items and weights to use
     * @returns Chosen item from array
     */
    public getWeightedValue<T>(itemArray: { [key: string]: unknown } | ArrayLike<unknown>): T {
        const itemKeys = Object.keys(itemArray);
        const weights = Object.values(itemArray);

        const chosenItem = this.weightedRandom(itemKeys, weights);

        return chosenItem.item;
    }

    /**
     * Picks the random item based on its weight.
     * The items with higher weight will be picked more often (with a higher probability).
     *
     * For example:
     * - items = ['banana', 'orange', 'apple']
     * - weights = [0, 0.2, 0.8]
     * - weightedRandom(items, weights) in 80% of cases will return 'apple', in 20% of cases will return
     * 'orange' and it will never return 'banana' (because probability of picking the banana is 0%)
     *
     * @param {any[]} items
     * @param {number[]} weights
     * @returns {{item: any, index: number}}
     */
    public weightedRandom(items: any[], weights: any[]): { item: any; index: number } {
        if (!items || items.length === 0) {
            throw new Error("Items must not be empty");
        }

        if (!weights || weights.length === 0) {
            throw new Error("Item weights must not be empty");
        }

        if (items.length !== weights.length) {
            throw new Error("Items and weight inputs must be of the same length");
        }

        // Preparing the cumulative weights array.
        // For example:
        // - weights = [1, 4, 3]
        // - cumulativeWeights = [1, 5, 8]
        const cumulativeWeights = [];
        for (let i = 0; i < weights.length; i += 1) {
            cumulativeWeights[i] = weights[i] + (cumulativeWeights[i - 1] || 0);
        }

        // Getting the random number in a range of [0...sum(weights)]
        // For example:
        // - weights = [1, 4, 3]
        // - maxCumulativeWeight = 8
        // - range for the random number is [0...8]
        const maxCumulativeWeight = cumulativeWeights[cumulativeWeights.length - 1];
        const randomNumber = maxCumulativeWeight * Math.random();

        // Picking the random item based on its weight.
        // The items with higher weight will be picked more often.
        for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
            if (cumulativeWeights[itemIndex] >= randomNumber) {
                return { item: items[itemIndex], index: itemIndex };
            }
        }
    }

    /**
     * Find the greated common divisor of all weights and use it on the passed in dictionary
     * @param weightedDict values to reduce
     */
    public reduceWeightValues(weightedDict: Record<string, number>): void {
        // No values, nothing to reduce
        if (Object.keys(weightedDict).length === 0) {
            return;
        }

        // Only one value, set to 1 and exit
        if (Object.keys(weightedDict).length === 1) {
            const key = Object.keys(weightedDict)[0];
            weightedDict[key] = 1;
            return;
        }

        const weights = Object.values(weightedDict).slice();
        const commonDivisor = this.commonDivisor(weights);

        // No point in dividing by  1
        if (commonDivisor === 1) {
            return;
        }

        for (const key in weightedDict) {
            if (Object.hasOwn(weightedDict, key)) {
                weightedDict[key] /= commonDivisor;
            }
        }
    }

    protected commonDivisor(numbers: number[]): number {
        let result = numbers[0];
        for (let i = 1; i < numbers.length; i++) {
            result = this.gcd(result, numbers[i]);
        }

        return result;
    }

    protected gcd(a: number, b: number): number {
        let x = a;
        let y = b;
        while (y !== 0) {
            const temp = y;
            y = x % y;
            x = temp;
        }
        return x;
    }
}
