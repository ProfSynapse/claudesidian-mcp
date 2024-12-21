import { interfaces } from '../interfaces/interfaces';
export declare class QueryableString implements interfaces.QueryableString {
    private readonly str;
    constructor(str: string);
    startsWith(searchString: string): boolean;
    endsWith(searchString: string): boolean;
    contains(searchString: string): boolean;
    equals(compareString: string): boolean;
    value(): string;
}
//# sourceMappingURL=queryable_string.d.ts.map