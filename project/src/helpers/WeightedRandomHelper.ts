import { injectable } from "tsyringe";

@injectable()
export class WeightedRandomHelper
{
    /**
     * USE getWeightedValue() WHERE POSSIBLE
     * Gets a tplId from a weighted dictionary
     * @param {tplId: weighting[]} itemArray
     * @returns tplId
     */
    public getWeightedInventoryItem(itemArray: { [tplId: string]: unknown; } | ArrayLike<unknown>): string
    {
        const itemKeys = Object.keys(itemArray);
        const weights = Object.values(itemArray);
        const chosenItem = this.weightedRandom(itemKeys, weights);

        return chosenItem.item;
    }

    public getWeightedValue<T>(itemArray: { [key: string]: unknown; } | ArrayLike<unknown>): T
    {
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
    public weightedRandom(items: string | any[], weights: string | any[]): { item: any; index: number; }
    {
        if (items.length !== weights.length)
        {
            throw new Error("Items and weights must be of the same size");
        }

        if (!items.length)
        {
            throw new Error("Items must not be empty");
        }

        // Preparing the cumulative weights array.
        // For example:
        // - weights = [1, 4, 3]
        // - cumulativeWeights = [1, 5, 8]
        const cumulativeWeights = [];
        for (let i = 0; i < weights.length; i += 1)
        {
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
        for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1)
        {
            if (cumulativeWeights[itemIndex] >= randomNumber)
            {
                return {
                    item: items[itemIndex],
                    index: itemIndex
                };
            }
        }
    }
}