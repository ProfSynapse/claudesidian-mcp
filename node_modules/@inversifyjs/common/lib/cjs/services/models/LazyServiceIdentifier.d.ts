import { ServiceIdentifier } from './ServiceIdentifier';
export declare const islazyServiceIdentifierSymbol: unique symbol;
export declare class LazyServiceIdentifier<TInstance = unknown> {
    #private;
    [islazyServiceIdentifierSymbol]: true;
    constructor(buildServiceId: () => ServiceIdentifier<TInstance>);
    static is<TInstance = unknown>(value: unknown): value is LazyServiceIdentifier<TInstance>;
    unwrap(): ServiceIdentifier<TInstance>;
}
//# sourceMappingURL=LazyServiceIdentifier.d.ts.map