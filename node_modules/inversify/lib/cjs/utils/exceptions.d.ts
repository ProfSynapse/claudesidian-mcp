export declare function isStackOverflowException(error: unknown): error is RangeError;
export declare const tryAndThrowErrorIfStackOverflow: <T>(fn: () => T, errorCallback: () => Error) => T;
//# sourceMappingURL=exceptions.d.ts.map