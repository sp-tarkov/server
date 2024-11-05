export class LinkedListNode<T> {
    constructor(
        public value: T,
        public prev?: LinkedListNode<T>,
        public next?: LinkedListNode<T>,
    ) {}
}
