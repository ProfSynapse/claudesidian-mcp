"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDecoratorInfo = getDecoratorInfo;
const InversifyCoreError_1 = require("../../error/models/InversifyCoreError");
const InversifyCoreErrorKind_1 = require("../../error/models/InversifyCoreErrorKind");
const DecoratorInfoKind_1 = require("../models/DecoratorInfoKind");
function getDecoratorInfo(target, propertyKey, parameterIndex) {
    if (parameterIndex === undefined) {
        if (propertyKey === undefined) {
            throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.unknown, 'Unexpected undefined property and index values');
        }
        return {
            kind: DecoratorInfoKind_1.DecoratorInfoKind.property,
            property: propertyKey,
            targetClass: target.constructor,
        };
    }
    return {
        index: parameterIndex,
        kind: DecoratorInfoKind_1.DecoratorInfoKind.parameter,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        targetClass: target,
    };
}
//# sourceMappingURL=getDecoratorInfo.js.map