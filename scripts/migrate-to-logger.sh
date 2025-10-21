#!/bin/bash
# Automated Console.log to Logger Migration Script
# Converts console.log/error/warn to Winston logger calls

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}=== Console.log to Logger Migration Tool ===${NC}\n"

# Configuration
DRY_RUN=${DRY_RUN:-false}
TARGET_DIRS="${TARGET_DIRS:-src}"
BACKUP_DIR="$PROJECT_ROOT/.backups/logger-migration-$(date +%Y%m%d-%H%M%S)"

# Stats tracking
declare -i FILES_PROCESSED=0
declare -i TOTAL_REPLACEMENTS=0
declare -i FILES_MODIFIED=0

# Create backup directory
create_backup() {
  echo -e "${YELLOW}Creating backup at: $BACKUP_DIR${NC}"
  mkdir -p "$BACKUP_DIR"
}

# Backup a file before modification
backup_file() {
  local file=$1
  local rel_path="${file#$PROJECT_ROOT/}"
  local backup_path="$BACKUP_DIR/$rel_path"

  mkdir -p "$(dirname "$backup_path")"
  cp "$file" "$backup_path"
}

# Check if file already has logger import
has_logger_import() {
  local file=$1
  grep -q "import.*logger.*from.*utils/logger" "$file" 2>/dev/null
}

# Add logger import to file
add_logger_import() {
  local file=$1

  # Find the last import statement line
  local last_import_line=$(grep -n "^import " "$file" | tail -1 | cut -d: -f1)

  if [ -z "$last_import_line" ]; then
    # No imports found, add at top after shebang/comments
    local insert_line=$(awk '/^[^\/\*#]/ {print NR; exit}' "$file")
    sed -i "${insert_line}i import { logger } from './utils/logger.js';" "$file"
  else
    # Add after last import
    sed -i "$((last_import_line + 1))i import { logger } from './utils/logger.js';" "$file"
  fi
}

# Migrate console statements in a file
migrate_file() {
  local file=$1
  local modified=false

  FILES_PROCESSED=$((FILES_PROCESSED + 1))

  echo -e "${BLUE}Processing:${NC} $file"

  # Count console statements
  local console_count=$(grep "console\.\(log\|error\|warn\|info\|debug\)" "$file" 2>/dev/null | wc -l)

  if [ "$console_count" -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} No console statements found"
    return
  fi

  echo -e "  Found ${YELLOW}$console_count${NC} console statements"

  if [ "$DRY_RUN" = true ]; then
    echo -e "  ${YELLOW}[DRY RUN]${NC} Would replace console statements"
    TOTAL_REPLACEMENTS=$((TOTAL_REPLACEMENTS + console_count))
    return
  fi

  # Create backup
  backup_file "$file"

  # Add logger import if not present
  if ! has_logger_import "$file"; then
    echo -e "  ${YELLOW}+${NC} Adding logger import"
    add_logger_import "$file"
  fi

  # Perform replacements
  # console.log → logger.info
  sed -i -E 's/console\.log\(/logger.info(/g' "$file"

  # console.error → logger.error
  sed -i -E 's/console\.error\(/logger.error(/g' "$file"

  # console.warn → logger.warn
  sed -i -E 's/console\.warn\(/logger.warn(/g' "$file"

  # console.info → logger.info
  sed -i -E 's/console\.info\(/logger.info(/g' "$file"

  # console.debug → logger.debug
  sed -i -E 's/console\.debug\(/logger.debug(/g' "$file"

  echo -e "  ${GREEN}✓${NC} Replaced $console_count console statements"

  TOTAL_REPLACEMENTS=$((TOTAL_REPLACEMENTS + console_count))
  FILES_MODIFIED=$((FILES_MODIFIED + 1))
}

# Migrate all files in a directory
migrate_directory() {
  local dir=$1

  echo -e "\n${BLUE}Scanning directory:${NC} $dir\n"

  # Find all .js files, excluding node_modules
  while IFS= read -r -d '' file; do
    migrate_file "$file"
  done < <(find "$dir" -name "*.js" -type f -not -path "*/node_modules/*" -print0)
}

# Show statistics
show_stats() {
  echo -e "\n${BLUE}=== Migration Statistics ===${NC}\n"
  echo -e "Files processed:    ${YELLOW}$FILES_PROCESSED${NC}"
  echo -e "Files modified:     ${GREEN}$FILES_MODIFIED${NC}"
  echo -e "Total replacements: ${GREEN}$TOTAL_REPLACEMENTS${NC}"
  echo -e "Backup location:    ${YELLOW}$BACKUP_DIR${NC}"
}

# Verify migrations (check syntax)
verify_migrations() {
  echo -e "\n${BLUE}=== Verifying Migrations ===${NC}\n"

  local errors=0

  while IFS= read -r -d '' file; do
    if ! node --check "$file" 2>/dev/null; then
      echo -e "${RED}✗${NC} Syntax error in: $file"
      errors=$((errors + 1))
    fi
  done < <(find "$TARGET_DIRS" -name "*.js" -type f -not -path "*/node_modules/*" -print0)

  if [ $errors -eq 0 ]; then
    echo -e "${GREEN}✓${NC} All files passed syntax check"
  else
    echo -e "${RED}✗${NC} $errors files have syntax errors"
    echo -e "${YELLOW}Backups available at:${NC} $BACKUP_DIR"
    return 1
  fi
}

# Rollback migrations
rollback() {
  echo -e "${YELLOW}Rolling back migrations from: $BACKUP_DIR${NC}"

  if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${RED}Error: Backup directory not found${NC}"
    return 1
  fi

  # Restore all files from backup
  cp -r "$BACKUP_DIR"/* "$PROJECT_ROOT/"

  echo -e "${GREEN}✓${NC} Rollback complete"
}

# Main execution
main() {
  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      --dry-run)
        DRY_RUN=true
        shift
        ;;
      --rollback)
        if [ -z "$2" ]; then
          echo -e "${RED}Error: --rollback requires backup directory${NC}"
          exit 1
        fi
        BACKUP_DIR="$2"
        rollback
        exit 0
        ;;
      --dirs)
        TARGET_DIRS="$2"
        shift 2
        ;;
      --help)
        cat << EOF
Usage: $0 [OPTIONS]

Options:
  --dry-run              Show what would be changed without modifying files
  --rollback <backup>    Restore files from backup directory
  --dirs <directories>   Target directories (default: src)
  --help                 Show this help message

Environment Variables:
  DRY_RUN=true          Enable dry-run mode
  TARGET_DIRS="src test" Specify target directories

Examples:
  # Dry run to see what would change
  $0 --dry-run

  # Migrate src directory
  $0 --dirs src

  # Migrate multiple directories
  $0 --dirs "src tests"

  # Rollback changes
  $0 --rollback .backups/logger-migration-20251017-120000

EOF
        exit 0
        ;;
      *)
        echo -e "${RED}Unknown option: $1${NC}"
        echo "Use --help for usage information"
        exit 1
        ;;
    esac
  done

  # Show configuration
  echo -e "Configuration:"
  echo -e "  Dry run:        ${YELLOW}$DRY_RUN${NC}"
  echo -e "  Target dirs:    ${YELLOW}$TARGET_DIRS${NC}"
  echo -e ""

  # Create backup directory
  if [ "$DRY_RUN" = false ]; then
    create_backup
  fi

  # Migrate each target directory
  for dir in $TARGET_DIRS; do
    if [ -d "$PROJECT_ROOT/$dir" ]; then
      migrate_directory "$PROJECT_ROOT/$dir"
    else
      echo -e "${YELLOW}Warning: Directory not found: $dir${NC}"
    fi
  done

  # Show statistics
  show_stats

  # Verify migrations if not dry run
  if [ "$DRY_RUN" = false ] && [ $FILES_MODIFIED -gt 0 ]; then
    verify_migrations
  fi

  # Final message
  if [ "$DRY_RUN" = true ]; then
    echo -e "\n${YELLOW}This was a dry run. No files were modified.${NC}"
    echo -e "Run without --dry-run to apply changes.\n"
  else
    echo -e "\n${GREEN}✓ Migration complete!${NC}\n"
    echo -e "Next steps:"
    echo -e "  1. Review changes: ${YELLOW}git diff${NC}"
    echo -e "  2. Run tests: ${YELLOW}npm test${NC}"
    echo -e "  3. Commit changes: ${YELLOW}git add . && git commit${NC}"
    echo -e "\nIf something went wrong:"
    echo -e "  Rollback: ${YELLOW}$0 --rollback $BACKUP_DIR${NC}\n"
  fi
}

# Run main function
main "$@"
