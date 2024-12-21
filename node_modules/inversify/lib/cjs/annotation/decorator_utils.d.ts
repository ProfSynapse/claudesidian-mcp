import { interfaces } from '../interfaces/interfaces';
type Prototype<T> = {
    [Property in keyof T]: T[Property] extends NewableFunction ? T[Property] : T[Property] | undefined;
} & {
    constructor: NewableFunction;
};
interface ConstructorFunction<T = Record<string, unknown>> {
    prototype: Prototype<T>;
    new (...args: unknown[]): T;
}
export type DecoratorTarget<T = unknown> = ConstructorFunction<T> | Prototype<T>;
declare function tagParameter(annotationTarget: DecoratorTarget, parameterName: string | symbol | undefined, parameterIndex: number, metadata: interfaces.MetadataOrMetadataArray): void;
declare function tagProperty(annotationTarget: DecoratorTarget, propertyName: string | symbol, metadata: interfaces.MetadataOrMetadataArray): void;
declare function createTaggedDecorator(metadata: interfaces.MetadataOrMetadataArray): <T>(target: DecoratorTarget, targetKey?: string | symbol, indexOrPropertyDescriptor?: number | TypedPropertyDescriptor<T>) => void;
declare function decorate(decorator: DecoratorTarget | ParameterDecorator | MethodDecorator, target: object, parameterIndexOrProperty?: number | string): void;
export { decorate, tagParameter, tagProperty, createTaggedDecorator };
//# sourceMappingURL=decorator_utils.d.ts.map