export class LinkedList<T>
{
    private head: LinkedListNode<T>;
    private tail: LinkedListNode<T>;

    public add(t: T): void
    {
        if (!this.head)
        {
            const node = new LinkedListNode(t);
            this.head = node;
            this.tail = node;
        }
        else
        {
            let ref = this.head;
            let next = this.head.getNextNode();
            while (next)
            {
                ref = next;
                next = ref.getNextNode();
            }
            const node = new LinkedListNode(t, ref);
            ref.setNextNode(node);
            this.tail = node;
        }
    }

    public addRange(list: T[]): void
    {
        for (const item of list)
        {
            this.add(item);
        }
    }

    public getHead(): LinkedListNode<T>
    {
        return this.head;
    }

    public getTail(): LinkedListNode<T>
    {
        return this.tail;
    }

    public isEmpty(): boolean
    {
        return this.head === undefined || this.head === null;
    }

    public getSize(): number
    {
        let size = 0;
        let next = this.head;
        while (next)
        {
            size++;
            next = next.getNextNode();
        }
        return size;
    }

    public removeFirst(): LinkedListNode<T>
    {
        if (!this.head)
        {
            return undefined;
        }

        const node = this.head;
        if (this.head.getNextNode())
        {
            this.head = this.head.getNextNode();
            this.head.setPreviousNode(undefined);
        }
        else
        {
            this.head = undefined;
        }
        return node;
    }

    public removeLast(): LinkedListNode<T>
    {
        if (!this.tail)
        {
            return undefined;
        }

        const node = this.tail;
        if (this.tail.getPreviousNode())
        {
            this.tail = this.tail.getPreviousNode();
            this.tail.setNextNode(undefined);
        }
        else
        {
            this.tail = undefined;
        }
        return node;
    }

    public indexOf(func: (t: T) => boolean): number
    {
        const node = this.head;
        let index = 0;
        while (node)
        {
            if (func(node.getValue()))
            {
                return index;
            }
            index++;
        }
        return undefined;
    }

    public contains(func: (t: T) => boolean): boolean
    {
        let node = this.head;
        while (node)
        {
            if (func(node.getValue()))
            {
                return true;
            }
            node = node.getNextNode();
        }
        return false;
    }

    public forEachNode(func: (t: LinkedListNode<T>) => void): void
    {
        let node = this.head;
        while (node)
        {
            func(node);
            node = node.getNextNode();
        }
    }

    public forEachValue(func: (t: T) => void): void
    {
        let node = this.head;
        while (node)
        {
            func(node.getValue());
            node = node.getNextNode();
        }
    }

    public findFirstNode(func: (t: LinkedListNode<T>) => boolean): LinkedListNode<T>
    {
        let node = this.head;
        while (node)
        {
            if (func(node))
            {
                return node;
            }
            node = node.getNextNode();
        }
        return undefined;
    }

    public findFirstValue(func: (t: T) => boolean): T
    {
        let node = this.head;
        while (node)
        {
            if (func(node.getValue()))
            {
                return node.getValue();
            }
            node = node.getNextNode();
        }
        return undefined;
    }

    public toList(): T[]
    {
        const elements: T[] = [];
        let node = this.head;
        while (node)
        {
            elements.push(node.getValue());
            node = node.getNextNode();
        }
        return elements;
    }
}

export class LinkedListNode<T>
{
    private previous: LinkedListNode<T>;
    private value: T;
    private next: LinkedListNode<T>;

    constructor(value: T, previous: LinkedListNode<T> = undefined, next: LinkedListNode<T> = undefined)
    {
        this.value = value;
        this.previous = previous;
        this.next = next;
    }

    public getValue(): T
    {
        return this.value;
    }

    public getNextNode(): LinkedListNode<T>
    {
        return this.next;
    }

    public setNextNode(node: LinkedListNode<T>): void
    {
        this.next = node;
    }

    public getPreviousNode(): LinkedListNode<T>
    {
        return this.previous;
    }

    public setPreviousNode(node: LinkedListNode<T>): void
    {
        this.previous = node;
    }
}
