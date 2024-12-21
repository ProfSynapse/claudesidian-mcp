"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleInjectionError = handleInjectionError;
const getDecoratorInfo_1 = require("../../decorator/calculations/getDecoratorInfo");
const stringifyDecoratorInfo_1 = require("../../decorator/calculations/stringifyDecoratorInfo");
const InversifyCoreError_1 = require("../../error/models/InversifyCoreError");
const InversifyCoreErrorKind_1 = require("../../error/models/InversifyCoreErrorKind");
function handleInjectionError(target, propertyKey, parameterIndex, error) {
    if (InversifyCoreError_1.InversifyCoreError.isErrorOfKind(error, InversifyCoreErrorKind_1.InversifyCoreErrorKind.injectionDecoratorConflict)) {
        const info = (0, getDecoratorInfo_1.getDecoratorInfo)(target, propertyKey, parameterIndex);
        throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.injectionDecoratorConflict, `Unexpected injection error.

Cause:

${error.message}

Details

${(0, stringifyDecoratorInfo_1.stringifyDecoratorInfo)(info)}`, { cause: error });
    }
    throw error;
}
//# sourceMappingURL=handleInjectionError.js.map