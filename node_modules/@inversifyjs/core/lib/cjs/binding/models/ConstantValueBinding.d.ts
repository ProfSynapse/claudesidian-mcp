import { bindingScopeValues } from './BindingScope';
import { bindingTypeValues } from './BindingType';
import { ScopedBinding } from './ScopedBinding';
export type ConstantValueBinding<TActivated> = ScopedBinding<typeof bindingTypeValues.ConstantValue, typeof bindingScopeValues.Singleton, TActivated>;
//# sourceMappingURL=ConstantValueBinding.d.ts.map