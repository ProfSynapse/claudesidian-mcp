import { interfaces } from '../interfaces/interfaces';
declare class BindingOnSyntax<T> implements interfaces.BindingOnSyntax<T> {
    private readonly _binding;
    constructor(binding: interfaces.Binding<T>);
    onActivation(handler: interfaces.BindingActivation<T>): interfaces.BindingWhenSyntax<T>;
    onDeactivation(handler: interfaces.BindingDeactivation<T>): interfaces.BindingWhenSyntax<T>;
}
export { BindingOnSyntax };
//# sourceMappingURL=binding_on_syntax.d.ts.map