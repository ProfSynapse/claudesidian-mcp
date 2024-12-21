"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tagged = tagged;
const metadata_1 = require("../planning/metadata");
const decorator_utils_1 = require("./decorator_utils");
// Used to add custom metadata which is used to resolve metadata-based contextual bindings.
function tagged(metadataKey, metadataValue) {
    return (0, decorator_utils_1.createTaggedDecorator)(new metadata_1.Metadata(metadataKey, metadataValue));
}
//# sourceMappingURL=tagged.js.map