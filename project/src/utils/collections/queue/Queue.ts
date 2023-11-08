export class Queue<T> {
    private elements: Record<number, T>;
    private head: number;
    private tail: number;
    constructor() {
        this.elements = {};
        this.head = 0;
        this.tail = 0;
    }

    public enqueue(element: T): void {
        this.elements[this.tail] = element;
        this.tail++;
    }

    public enqueueAll(elements: T[]): void {
        elements.forEach((e) => this.enqueue(e));
    }

    public dequeue(): T {
        const item = this.elements[this.head];
        delete this.elements[this.head];
        this.head++;
        return item;
    }

    public peek(): T {
        return this.elements[this.head];
    }
    public getLength(): number {
        return this.tail - this.head;
    }

    public isEmpty(): boolean {
        return this.getLength() === 0;
    }
}
