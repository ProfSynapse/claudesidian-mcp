import { LegacyQueryableString } from './LegacyQueryableString';
export declare class LegacyQueryableStringImpl implements LegacyQueryableString {
    #private;
    constructor(str: string);
    startsWith(searchString: string): boolean;
    endsWith(searchString: string): boolean;
    contains(searchString: string): boolean;
    equals(compareString: string): boolean;
    value(): string;
}
//# sourceMappingURL=LegacyQueryableStringImpl.d.ts.map