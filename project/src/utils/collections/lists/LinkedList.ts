import { LinkedListNode } from "@spt/utils/collections/lists/Nodes";

export class LinkedList<T> {
    private head?: LinkedListNode<T>;
    private tail?: LinkedListNode<T>;
    private _length: number;

    public get length(): number {
        return this._length;
    }

    private set length(value: number) {
        this._length = value;
    }

    constructor() {
        this.length = 0;
        this.head = this.tail = undefined;
    }

    /**
     * Adds an element to the start of the list.
     */
    public prepend(value: T): void {
        const node = new LinkedListNode(value);
        this.length++;

        if (!this.head) {
            this.head = this.tail = node;
            return;
        }

        node.next = this.head;
        this.head.prev = node;
        this.head = node;
    }

    /**
     * Adds an element at the given index to the list.
     */
    public insertAt(value: T, idx: number): void {
        if (idx < 0 || idx > this.length) {
            return;
        }

        if (idx === 0) {
            this.prepend(value);
            return;
        }

        if (idx === this.length) {
            this.append(value);
            return;
        }

        let ref = this.head;
        for (let i = 0; i <= idx; ++i) {
            ref = ref?.next;
        }

        const node = new LinkedListNode(value);
        this.length++;

        node.next = ref;
        node.prev = ref?.prev;
        if (ref) {
            ref.prev = node;
        }

        if (node.prev) {
            node.prev.next = node;
        }
    }

    /**
     * Adds an element to the end of the list.
     */
    public append(value: T): void {
        const node = new LinkedListNode(value);
        this.length++;

        if (!this.tail) {
            this.head = this.tail = node;
            return;
        }

        node.prev = this.tail;
        this.tail.next = node;
        this.tail = this.tail.next;
    }

    /**
     * Returns the first element's value.
     */
    public getHead(): T | undefined {
        return this.head?.value;
    }

    /**
     * Finds the element from the list at the given index and returns it's value.
     */
    public get(idx: number): T | undefined {
        if (idx < 0 || idx >= this.length) {
            return;
        }

        if (idx === 0) {
            return this.getHead();
        }

        if (idx === this.length - 1) {
            return this.getTail();
        }

        for (const [index, value] of this.entries()) {
            if (idx === index) {
                return value;
            }
        }
    }

    /**
     * Returns the last element's value.
     */
    public getTail(): T | undefined {
        return this.tail?.value;
    }

    /**
     * Finds and removes the first element from a list that has a value equal to the given value, returns it's value if it successfully removed it.
     */
    public remove(value: T): T | undefined {
        let ref = this.head;
        for (let i = 0; ref && i < this.length; ++i) {
            if (ref.value === value) {
                break;
            }
            ref = ref.next;
        }

        if (!ref) {
            return;
        }

        this.length--;

        if (this.length === 0) {
            const out = this.head?.value;
            this.head = this.tail = undefined;
            return out;
        }

        if (ref.prev) {
            ref.prev.next = ref.next;
        }
        if (ref.next) {
            ref.next.prev = ref.prev;
        }

        if (ref === this.head) {
            this.head = ref.next;
        }

        if (ref === this.tail) {
            this.tail = ref.prev;
        }

        ref.prev = ref.next = undefined;

        return ref.value;
    }

    /**
     * Removes the first element from the list and returns it's value. If the list is empty, undefined is returned and the list is not modified.
     */
    public shift(): T | undefined {
        if (!this.head) {
            return;
        }

        this.length--;

        const ref = this.head;
        this.head = this.head.next;

        ref.next = undefined;

        if (this.length === 0) {
            this.tail = undefined;
        }

        return ref.value;
    }

    /**
     * Removes the element from the list at the given index and returns it's value.
     */
    public removeAt(idx: number): T | undefined {
        if (idx < 0 || idx >= this.length) {
            return;
        }

        if (idx === 0) {
            return this.shift();
        }

        if (idx === this.length - 1) {
            return this.pop();
        }

        let ref = this.head;
        this.length--;

        for (let i = 0; i < idx; ++i) {
            ref = ref?.next;
        }

        if (ref?.prev) {
            ref.prev.next = ref.next;
        }
        if (ref?.next) {
            ref.next.prev = ref.prev;
        }

        return ref?.value;
    }

    /**
     * Removes the last element from the list and returns it's value. If the list is empty, undefined is returned and the list is not modified.
     */
    public pop(): T | undefined {
        if (!this.tail) {
            return;
        }

        this.length--;

        const ref = this.tail;
        this.tail = this.tail.prev;

        ref.prev = undefined;

        if (this.length === 0) {
            this.head = undefined;
        }

        return ref.value;
    }

    /**
     * Returns an iterable of index, value pairs for every entry in the list.
     */
    public *entries(): IterableIterator<[number, T | undefined]> {
        let node = this.head;
        for (let i = 0; i < this.length; ++i) {
            yield [i, node?.value];
            node = node?.next;
        }
    }

    /**
     * Returns an iterable of values in the list.
     */
    public *values(): IterableIterator<T> {
        let node = this.head;
        while (node) {
            yield node.value;
            node = node.next;
        }
    }
}
