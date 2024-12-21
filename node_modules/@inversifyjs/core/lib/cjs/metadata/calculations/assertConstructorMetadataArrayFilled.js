"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertConstructorMetadataArrayFilled = assertConstructorMetadataArrayFilled;
const InversifyCoreError_1 = require("../../error/models/InversifyCoreError");
const InversifyCoreErrorKind_1 = require("../../error/models/InversifyCoreErrorKind");
function assertConstructorMetadataArrayFilled(type, value) {
    const undefinedIndexes = [];
    // Using a for loop to ensure empty values are traversed as well
    for (let i = 0; i < value.length; ++i) {
        const element = value[i];
        if (element === undefined) {
            undefinedIndexes.push(i);
        }
    }
    if (undefinedIndexes.length > 0) {
        throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.missingInjectionDecorator, `Found unexpected missing metadata on type "${type.name}" at constructor indexes "${undefinedIndexes.join('", "')}".

Are you using @inject, @multiInject or @unmanaged decorators at those indexes?

If you're using typescript and want to rely on auto injection, set "emitDecoratorMetadata" compiler option to true`);
    }
}
//# sourceMappingURL=assertConstructorMetadataArrayFilled.js.map