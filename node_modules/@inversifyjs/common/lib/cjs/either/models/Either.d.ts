export type Either<TLeft, TRight> = Left<TLeft> | Right<TRight>;
export interface BaseEither<T> {
    value: T;
}
export interface Left<T> extends BaseEither<T> {
    isRight: false;
}
export interface Right<T> extends BaseEither<T> {
    isRight: true;
}
//# sourceMappingURL=Either.d.ts.map