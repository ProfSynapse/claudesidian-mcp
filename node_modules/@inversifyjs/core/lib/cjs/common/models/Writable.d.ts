export type Writable<T> = {
    -readonly [TKey in keyof T]: T[TKey];
};
//# sourceMappingURL=Writable.d.ts.map