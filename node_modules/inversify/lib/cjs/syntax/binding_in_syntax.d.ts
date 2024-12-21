import { interfaces } from '../interfaces/interfaces';
declare class BindingInSyntax<T> implements interfaces.BindingInSyntax<T> {
    private readonly _binding;
    constructor(binding: interfaces.Binding<T>);
    inRequestScope(): interfaces.BindingWhenOnSyntax<T>;
    inSingletonScope(): interfaces.BindingWhenOnSyntax<T>;
    inTransientScope(): interfaces.BindingWhenOnSyntax<T>;
}
export { BindingInSyntax };
//# sourceMappingURL=binding_in_syntax.d.ts.map