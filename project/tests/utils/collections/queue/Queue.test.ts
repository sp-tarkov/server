import "reflect-metadata";
import { Queue } from "@spt/utils/collections/queue/Queue";
import { describe, expect, it } from "vitest";

describe("LinkedList", () => {
    describe("enqueue", () => {
        const queue = new Queue<number>();
        queue.enqueue(420);
        queue.enqueue(69);
        queue.enqueue(8008135);
        queue.enqueue(1337);

        it("adds elements to the end of the queue", () => {
            expect(queue.peek()).toEqual(420);
            expect(queue.length).toEqual(4);
        });
    });

    describe("enqueueAll", () => {
        const queue = new Queue<number>();
        queue.enqueueAll([420, 69, 8008135, 1337]);

        it("iterates the array and adds each element to the end of the queue", () => {
            expect(queue.peek()).toEqual(420);
            expect(queue.length).toEqual(4);
        });
    });

    describe("dequeue", () => {
        const queue = new Queue<number>();
        queue.enqueueAll([420, 69, 8008135, 1337]);

        it("removes the first element and return it's value", () => {
            expect(queue.dequeue()).toEqual(420);
            expect(queue.peek()).toEqual(69);
            expect(queue.length).toEqual(3);

            expect(queue.dequeue()).toEqual(69);
            expect(queue.peek()).toEqual(8008135);
            expect(queue.length).toEqual(2);

            expect(queue.dequeue()).toEqual(8008135);
            expect(queue.peek()).toEqual(1337);
            expect(queue.length).toEqual(1);

            expect(queue.dequeue()).toEqual(1337);
            expect(queue.peek()).toEqual(undefined);
            expect(queue.length).toEqual(0);

            expect(queue.dequeue()).toEqual(undefined);
            expect(queue.peek()).toEqual(undefined);
            expect(queue.length).toEqual(0);
        });
    });
});
