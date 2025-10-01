#!/bin/bash

# Script to compile all files in src/ into a single markdown file
# Usage: ./compile-src.sh [output-file]

OUTPUT_FILE="${1:-src-compiled.md}"
SRC_DIR="src"

# Check if src directory exists
if [ ! -d "$SRC_DIR" ]; then
    echo "Error: $SRC_DIR directory not found"
    exit 1
fi

# Create/clear the output file
echo "# Source Code Compilation" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "Generated on: $(date)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Function to get file extension for syntax highlighting
get_language() {
    case "$1" in
        *.ts) echo "typescript" ;;
        *.js) echo "javascript" ;;
        *.json) echo "json" ;;
        *.md) echo "markdown" ;;
        *.css) echo "css" ;;
        *.html) echo "html" ;;
        *.yml|*.yaml) echo "yaml" ;;
        *.sh) echo "bash" ;;
        *) echo "text" ;;
    esac
}

# Find all files in src directory and process them
find "$SRC_DIR" -type f | sort | while read -r file; do
    # Skip binary files and common exclusions
    if file "$file" | grep -q "binary\|image\|executable"; then
        continue
    fi

    # Get relative path from src/
    relative_path="${file#$SRC_DIR/}"

    # Get file extension for syntax highlighting
    language=$(get_language "$file")

    echo "Processing: $relative_path"

    # Add file heading
    echo "## $relative_path" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"

    # Add code block with content
    echo "\`\`\`$language" >> "$OUTPUT_FILE"
    cat "$file" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    echo "\`\`\`" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
done

echo "Compilation complete! Output saved to: $OUTPUT_FILE"
echo "Total files processed: $(find "$SRC_DIR" -type f ! -path "*/.*" | wc -l)"