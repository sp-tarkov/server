import { injectable } from "tsyringe";

export class FindSlotResult {
    constructor(
        public success = false,
        public x?: number,
        public y?: number,
        public rotation = false,
    ) {}
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

        // Every x+y slot taken up in container, exit
        if (container2D.every((x) => x.every((y) => y === 1))) {
            return new FindSlotResult(false);
        }

        // Down
        for (let y = 0; y < limitY; y++) {
            // Across
            if (container2D[y].every((x) => x === 1)) {
                // Every item in row is full, skip row
                continue;
            }

            for (let x = 0; x < limitX; x++) {
                let foundSlot = this.locateSlot(container2D, containerX, containerY, x, y, itemWidth, itemHeight);

                // Failed to find slot, rotate item and try again
                if (!foundSlot && itemWidth * itemHeight > 1) {
                    // Bigger than 1x1
                    foundSlot = this.locateSlot(container2D, containerX, containerY, x, y, itemHeight, itemWidth); // Height/Width swapped
                    if (foundSlot) {
                        // Found a slot for it when rotated
                        rotation = true;
                    }
                }

                if (!foundSlot) {
                    // Didn't fit this hole, try again
                    continue;
                }

                return new FindSlotResult(true, x, y, rotation);
            }
        }

        // Tried all possible holes, nothing big enough for the item
        return new FindSlotResult(false);
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
        itemH: number,
    ): boolean {
        let foundSlot = true;

        for (let itemY = 0; itemY < itemH; itemY++) {
            if (foundSlot && y + itemH - 1 > containerY - 1) {
                foundSlot = false;
                break;
            }

            // Does item fit x-ways across
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
     * @param container2D Container to place item in
     * @param x Container x size
     * @param y Container y size
     * @param itemW Items width
     * @param itemH Items height
     * @param rotate is item rotated
     */
    public fillContainerMapWithItem(
        container2D: number[][],
        x: number,
        y: number,
        itemW: number,
        itemH: number,
        rotate: boolean,
    ): void {
        // Swap height/width if we want to fit it in rotated
        const itemWidth = rotate ? itemH : itemW;
        const itemHeight = rotate ? itemW : itemH;

        for (let tmpY = y; tmpY < y + itemHeight; tmpY++) {
            for (let tmpX = x; tmpX < x + itemWidth; tmpX++) {
                if (container2D[tmpY][tmpX] === 0) {
                    // Flag slot as used
                    container2D[tmpY][tmpX] = 1;
                } else {
                    throw new Error(`Slot at (${x}, ${y}) is already filled. Cannot fit a ${itemW} by ${itemH}`);
                }
            }
        }
    }
}
