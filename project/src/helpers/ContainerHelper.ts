import { injectable } from "tsyringe";

export class FindSlotResult {
    success: boolean;
    x: any;
    y: any;
    rotation: boolean;
    constructor(success = false, x = null, y = null, rotation = false) {
        this.success = success;
        this.x = x;
        this.y = y;
        this.rotation = rotation;
    }
}

@injectable()
export class ContainerHelper {
    /**
     * Finds a slot for an item in a given 2D container map
     * @param container2D Array of container with slots filled/free
     * @param itemWidth Width of item
     * @param itemHeight Height of item
     * @returns Location to place item in container
     */
    public findSlotForItem(container2D: number[][], itemWidth: number, itemHeight: number): FindSlotResult {
        let rotation = false;
        const minVolume = (itemWidth < itemHeight ? itemWidth : itemHeight) - 1;
        const containerY = container2D.length;
        const containerX = container2D[0].length;
        const limitY = containerY - minVolume;
        const limitX = containerX - minVolume;

        for (let y = 0; y < limitY; y++) {
            for (let x = 0; x < limitX; x++) {
                let foundSlot = this.locateSlot(container2D, containerX, containerY, x, y, itemWidth, itemHeight);

                /**
                 * Try to rotate if there is enough room for the item
                 * Only occupies one grid of items, no rotation required
                 * */
                if (!foundSlot && itemWidth * itemHeight > 1) {
                    foundSlot = this.locateSlot(container2D, containerX, containerY, x, y, itemHeight, itemWidth);

                    if (foundSlot) {
                        rotation = true;
                    }
                }

                if (!foundSlot) {
                    continue;
                }

                return new FindSlotResult(true, x, y, rotation);
            }
        }

        return new FindSlotResult();
    }

    /**
     * Find a slot inside a container an item can be placed in
     * @param container2D Container to find space in
     * @param containerX Container x size
     * @param containerY Container y size
     * @param x ???
     * @param y ???
     * @param itemW Items width
     * @param itemH Items height
     * @returns True - slot found
     */
    protected locateSlot(
        container2D: number[][],
        containerX: number,
        containerY: number,
        x: number,
        y: number,
        itemW: number,
        itemH: number
    ): boolean {
        let foundSlot = true;

        for (let itemY = 0; itemY < itemH; itemY++) {
            if (foundSlot && y + itemH - 1 > containerY - 1) {
                foundSlot = false;
                break;
            }

            // Does item fit x-ways
            for (let itemX = 0; itemX < itemW; itemX++) {
                if (foundSlot && x + itemW - 1 > containerX - 1) {
                    foundSlot = false;
                    break;
                }

                if (container2D[y + itemY][x + itemX] !== 0) {
                    foundSlot = false;
                    break;
                }
            }

            if (!foundSlot) {
                break;
            }
        }

        return foundSlot;
    }

    /**
     * Find a free slot for an item to be placed at
     * @param container2D Container to palce item in
     * @param x Container x size
     * @param y Container y size
     * @param itemW Items width
     * @param itemH Items height
     * @param rotate is item rotated
     * @returns Location to place item
     */
    public fillContainerMapWithItem(
        container2D: number[][],
        x: number,
        y: number,
        itemW: number,
        itemH: number,
        rotate: boolean
    ): number[][] {
        const itemWidth = rotate ? itemH : itemW;
        const itemHeight = rotate ? itemW : itemH;

        for (let tmpY = y; tmpY < y + itemHeight; tmpY++) {
            for (let tmpX = x; tmpX < x + itemWidth; tmpX++) {
                if (container2D[tmpY][tmpX] === 0) {
                    container2D[tmpY][tmpX] = 1;
                } else {
                    throw new Error(`Slot at (${x}, ${y}) is already filled`);
                }
            }
        }

        return container2D;
    }
}
