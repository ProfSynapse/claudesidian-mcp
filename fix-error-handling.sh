#!/bin/bash

# This script updates all vaultManager mode files to use the errorUtils functions
# for proper handling of unknown error types.

# Add import statement to each file
find src/agents/vaultManager/modes -name "*.ts" -type f -exec sed -i '6i import { createErrorMessage } from "../../../utils/errorUtils";' {} \;

# Fix specific files with known error handling issues
sed -i 's/\`Failed to list folders: \${error\.message}\`/createErrorMessage("Failed to list folders: ", error)/g' src/agents/vaultManager/modes/listFoldersMode.ts
sed -i 's/\`Failed to list files: \${error\.message}\`/createErrorMessage("Failed to list files: ", error)/g' src/agents/vaultManager/modes/listFilesMode.ts
sed -i 's/\`Failed to edit folder: \${error\.message}\`/createErrorMessage("Failed to edit folder: ", error)/g' src/agents/vaultManager/modes/editFolderMode.ts
sed -i 's/error: error\.message/error: createErrorMessage("Failed to delete note: ", error)/g' src/agents/vaultManager/modes/deleteNoteMode.ts
sed -i 's/error: error\.message/error: createErrorMessage("Failed to delete folder: ", error)/g' src/agents/vaultManager/modes/deleteFolderMode.ts
sed -i 's/error: error\.message/error: createErrorMessage("Failed to create note: ", error)/g' src/agents/vaultManager/modes/createNoteMode.ts
sed -i 's/error: error\.message/error: createErrorMessage("Failed to move folder: ", error)/g' src/agents/vaultManager/modes/moveFolderMode.ts
sed -i 's/error: error\.message/error: createErrorMessage("Failed to move note: ", error)/g' src/agents/vaultManager/modes/moveNoteMode.ts

echo "Error handling fixes completed!"