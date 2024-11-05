import { LinkedList } from "@spt/utils/collections/lists/LinkedList";

export class Queue<T> {
    private list: LinkedList<T>;

    public get length(): number {
        return this.list.length;
    }

    constructor() {
        this.list = new LinkedList<T>();
    }

    /**
     * Adds an element to the end of the queue.
     */
    public enqueue(element: T): void {
        this.list.append(element);
    }

    /**
     * Iterates over the elements received and adds each one to the end of the queue.
     */
    public enqueueAll(elements: T[]): void {
        for (const element of elements) {
            this.enqueue(element);
        }
    }

    /**
     * Removes the first element from the queue and returns it's value. If the queue is empty, undefined is returned and the queue is not modified.
     */
    public dequeue(): T | undefined {
        return this.list.shift();
    }

    /**
     * Returns the first element's value.
     */
    public peek(): T | undefined {
        return this.list.getHead();
    }
}
