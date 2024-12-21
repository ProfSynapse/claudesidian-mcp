import { ServiceIdentifier } from '@inversifyjs/common';
import { Binding } from '../models/Binding';
export interface BindingService {
    get<TInstance>(serviceIdentifier: ServiceIdentifier<TInstance>): Binding<TInstance>[] | undefined;
    remove(serviceIdentifier: ServiceIdentifier): void;
    removeByModule(moduleId: number): void;
    set<TInstance>(binding: Binding<TInstance>): void;
}
//# sourceMappingURL=BindingService.d.ts.map