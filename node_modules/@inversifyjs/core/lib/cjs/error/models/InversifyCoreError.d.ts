import { InversifyCoreErrorKind } from './InversifyCoreErrorKind';
export declare const isAppErrorSymbol: unique symbol;
export declare class InversifyCoreError extends Error {
    [isAppErrorSymbol]: true;
    kind: InversifyCoreErrorKind;
    constructor(kind: InversifyCoreErrorKind, message?: string, options?: ErrorOptions);
    static is(value: unknown): value is InversifyCoreError;
    static isErrorOfKind(value: unknown, kind: InversifyCoreErrorKind): value is InversifyCoreError;
}
//# sourceMappingURL=InversifyCoreError.d.ts.map