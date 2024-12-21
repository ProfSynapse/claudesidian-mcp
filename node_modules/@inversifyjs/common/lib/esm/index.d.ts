type Either<TLeft, TRight> = Left<TLeft> | Right<TRight>;
interface BaseEither<T> {
    value: T;
}
interface Left<T> extends BaseEither<T> {
    isRight: false;
}
interface Right<T> extends BaseEither<T> {
    isRight: true;
}

type Newable<TInstance = unknown, TArgs extends unknown[] = any[]> = new (...args: TArgs) => TInstance;

type ServiceIdentifier<TInstance = unknown> = string | symbol | Newable<TInstance> | Function;

declare function stringifyServiceIdentifier(serviceIdentifier: ServiceIdentifier): string;

declare const islazyServiceIdentifierSymbol: unique symbol;
declare class LazyServiceIdentifier<TInstance = unknown> {
    #private;
    [islazyServiceIdentifierSymbol]: true;
    constructor(buildServiceId: () => ServiceIdentifier<TInstance>);
    static is<TInstance = unknown>(value: unknown): value is LazyServiceIdentifier<TInstance>;
    unwrap(): ServiceIdentifier<TInstance>;
}

export { type BaseEither, type Either, LazyServiceIdentifier, type Left, type Newable, type Right, type ServiceIdentifier, stringifyServiceIdentifier };
