import "reflect-metadata";
import { LinkedList } from "@spt/utils/collections/lists/LinkedList";
import { describe, expect, it } from "vitest";

describe("LinkedList", () => {
    describe("prepend", () => {
        const list = new LinkedList<number>();
        list.prepend(420);
        list.prepend(69);
        list.prepend(8008135);
        list.prepend(1337);

        it("adds elements to the begining of the list", () => {
            expect(list.getHead()).toEqual(1337);
            expect(list.length).toEqual(4);
        });
    });

    describe("append", () => {
        const list = new LinkedList<number>();
        list.append(420);
        list.append(69);
        list.append(8008135);
        list.append(1337);

        it("adds elements to the end of the list", () => {
            expect(list.getHead()).toEqual(420);
            expect(list.length).toEqual(4);
        });
    });

    describe("insertAt", () => {
        describe("empty list", () => {
            const list = new LinkedList<number>();

            it("should allow insertions at index 0 only", () => {
                list.insertAt(420, 1);
                expect(list.length).toEqual(0);

                list.insertAt(420, 0);
                expect(list.length).toEqual(1);
            });
        });

        describe("filled list", () => {
            const list = new LinkedList<number>();
            list.append(420);
            list.append(69);
            list.append(8008135);
            list.append(1337);

            it("shouldn't insert if index is < 0 and > length", () => {
                list.insertAt(10100111001, -1);
                expect(list.length).toEqual(4);

                list.insertAt(123, 5); // index 4 would work even though it's out of bounds because it's the next index, it's the same as doing an append
                expect(list.length).toEqual(4);
            });

            it("should insert if index is between 0 and length", () => {
                list.insertAt(10100111001, 0);
                expect(list.length).toEqual(5);

                list.insertAt(69420, 3);
                expect(list.length).toEqual(6);

                list.insertAt(123, 6);
                expect(list.length).toEqual(7);
            });
        });
    });

    describe("getHead/getTail", () => {
        it("should return undefined if the list is empty", () => {
            const list = new LinkedList<number>();
            expect(list.getHead()).toEqual(undefined);
            expect(list.getTail()).toEqual(undefined);
        });

        it("should return the head and the tail values if the list has 1 or more elements", () => {
            const list = new LinkedList<number>();
            list.append(420);
            list.append(69);
            list.append(8008135);

            expect(list.getHead()).toEqual(420);
            expect(list.getTail()).toEqual(8008135);
        });
    });

    describe("get", () => {
        describe("empty list", () => {
            const list = new LinkedList<number>();

            it("should return undefined", () => {
                expect(list.get(0)).toEqual(undefined);
                expect(list.get(1)).toEqual(undefined);
            });
        });

        describe("filled list", () => {
            const list = new LinkedList<number>();
            list.append(420);
            list.append(69);
            list.append(8008135);
            list.append(1337);

            it("should return undefined if index is < 0 or >= length", () => {
                expect(list.get(-1)).toEqual(undefined);
                expect(list.get(list.length)).toEqual(undefined);
            });

            it("should return the value if the index is between 0 and length - 1", () => {
                expect(list.get(0)).toEqual(420);
                expect(list.get(1)).toEqual(69);
                expect(list.get(list.length - 1)).toEqual(1337);
            });
        });
    });

    describe("remove", () => {
        const list = new LinkedList<number>();
        list.append(420);
        list.append(69);
        list.append(8008135);
        list.append(1337);

        it("should return undefined if it doesn't find any element with the same value", () => {
            expect(list.remove(10100111001)).toEqual(undefined);
            expect(list.length).toEqual(4);
        });

        it("should remove an element and return it's value if one is found with the same value", () => {
            expect(list.remove(420)).toEqual(420);
            expect(list.length).toEqual(3);

            expect(list.remove(8008135)).toEqual(8008135);
            expect(list.length).toEqual(2);

            expect(list.remove(1337)).toEqual(1337);
            expect(list.length).toEqual(1);

            expect(list.remove(69)).toEqual(69);
            expect(list.length).toEqual(0);
        });
    });

    describe("shift", () => {
        describe("empty list", () => {
            const list = new LinkedList<number>();

            it("shouldn't change the list and should return undefined if list is empty", () => {
                expect(list.shift()).toEqual(undefined);
                expect(list.length).toEqual(0);
            });
        });

        describe("filled list", () => {
            const list = new LinkedList<number>();
            list.append(420);
            list.append(1337);

            it("should remove the first element and return it's value", () => {
                expect(list.shift()).toEqual(420);
                expect(list.length).toEqual(1);

                expect(list.shift()).toEqual(1337);
                expect(list.length).toEqual(0);
            });
        });
    });

    describe("pop", () => {
        describe("empty list", () => {
            const list = new LinkedList<number>();

            it("shouldn't change the list and should return undefined if list is empty", () => {
                expect(list.pop()).toEqual(undefined);
                expect(list.length).toEqual(0);
            });
        });

        describe("filled list", () => {
            const list = new LinkedList<number>();
            list.append(420);
            list.append(1337);

            it("should remove the first element and return it's value", () => {
                expect(list.pop()).toEqual(1337);
                expect(list.length).toEqual(1);

                expect(list.pop()).toEqual(420);
                expect(list.length).toEqual(0);
            });
        });
    });

    describe("removeAt", () => {
        const list = new LinkedList<number>();
        list.append(420);
        list.append(69);
        list.append(8008135);
        list.append(1337);
        list.append(10100111001);

        it("should return undefined if index is < 0 or >= length", () => {
            expect(list.removeAt(-1)).toEqual(undefined);
            expect(list.removeAt(list.length)).toEqual(undefined);
        });

        it("should remove an element and return it's value if index is between 0 and length - 1", () => {
            expect(list.removeAt(0)).toEqual(420);
            expect(list.length).toEqual(4);

            expect(list.removeAt(2)).toEqual(1337);
            expect(list.length).toEqual(3);

            expect(list.removeAt(list.length - 1)).toEqual(10100111001);
            expect(list.length).toEqual(2);

            expect(list.removeAt(1)).toEqual(8008135);
            expect(list.removeAt(0)).toEqual(69);
            expect(list.length).toEqual(0);
        });
    });
});
