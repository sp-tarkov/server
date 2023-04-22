import { inject, injectable } from "tsyringe";

import { IRagfairOffer } from "../models/eft/ragfair/IRagfairOffer";
import { ILogger } from "../models/spt/utils/ILogger";

@injectable()
export class RagfairCategoriesService
{
    protected categories: Record<string, number> = {};

    constructor(
        @inject("WinstonLogger") protected logger: ILogger
    )
    { }

    /**
     * Get all flea categories and their count of offers
     * @returns item categories and count
     */
    public getAllCategories(): Record<string, number> 
    {
        return this.categories;
    }

    /**
     * With the supplied items, get custom categories
     * @returns a custom list of categories
     */
    public getBespokeCategories(offers: IRagfairOffer[]): Record<string, number> 
    {
        return this.processOffersIntoCategories(offers);
    }

    /**
     * Take an array of ragfair offers and create a dictionary of items with thier corrisponding offer count
     * @param offers ragfair offers
     * @returns categories and count
     */
    protected processOffersIntoCategories(offers: IRagfairOffer[]): Record<string, number> 
    {
        const result = {};
        for (const offer of offers)
        {
            this.addOrIncrementCategory(offer, result);
        }

        return result;
    }

    /**
     * Increment or decrement a category array
     * @param offer offer to process
     * @param categories categories to update
     * @param increment should item be incremented or decremented
     */
    protected addOrIncrementCategory(offer: IRagfairOffer, categories: Record<string, number>, increment = true ): void
    {
        
        const itemId = offer.items[0]._tpl;
        if (increment)
        {
            if (!categories[itemId])
            {
                categories[itemId] = 1;
            }
            else
            {
                categories[itemId]++;
            }
        }
        else
        {
            
            // No category, no work to do
            if (!categories[itemId])
            {
                return;
            }

            // Key exists, decrement
            if (categories[itemId])
            {
                categories[itemId]--;
            }

            // remove category entirely as its 0 or less
            if (categories[itemId] < 1)
            {
                delete categories[itemId];
            }
        }
    }

    /**
     * Increase category count by 1
     * @param offer 
     */
    public incrementCategory(offer: IRagfairOffer): void
    {
        this.addOrIncrementCategory(offer, this.categories);
        this.categories[offer.items[0]._tpl]++;
    }

    /**
     * Reduce category count by 1
     * @param offer 
     */
    public decrementCategory(offer: IRagfairOffer): void
    {
        this.addOrIncrementCategory(offer, this.categories, false);
        this.categories[offer.items[0]._tpl]--;
    }
}