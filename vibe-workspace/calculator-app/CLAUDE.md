# Calculator App - Claude Code Configuration

## Project Overview

Simple CLI calculator

## Project Structure

```

src/          - Main application source code
tests/        - Test files
db/           - Database files
bin/          - Executable scripts

```

## Technical Stack

- **Language**: JavaScript
- **Database**: SQLite
- **Testing**: Jest/pytest
- **Package Manager**: npm

## Commands

### Development

```bash
npm run dev        # Start development server
npm test          # Run tests
npm run build    # Build for production
npm run lint      # Run linter
```

## Coding Conventions

### Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Always use semicolons
- Use camelCase for variables and functions

### Architecture Patterns

- Follow MVC pattern for application structure
- Separate business logic from presentation
- Use try-catch blocks for async operations

### Security Rules

- **NEVER** hardcode API keys, passwords, or secrets in source files
- **ALWAYS** use parameterized queries for database operations
- **ALWAYS** validate and sanitize user input
- Store sensitive data in .env files (must be in .gitignore)

## Anti-Patterns to Avoid

### Database

- ❌ Raw SQL string concatenation (SQL injection risk)
- ❌ Missing database connection cleanup
- ❌ No error handling on queries

### Code Quality

- ❌ Functions longer than 50 lines
- ❌ Deeply nested conditionals (>3 levels)
- ❌ Duplicate code blocks
- ❌ Magic numbers without constants

### Git Workflow

- ❌ Committing node_modules or build artifacts
- ❌ Committing .env or credentials files
- ❌ Vague commit messages like "fix stuff"

## Testing Requirements

- All new features MUST have tests
- Minimum test coverage: 80%
- Tests must pass before commits
- Use describe/it pattern for test organization

## Sub-Agents Configuration

- `code-reviewer`: Reviews code for bugs and best practices
- `test-writer`: Generates comprehensive test suites
- `db-designer`: Designs database schemas

## Workflow

1. **Explore**: Read codebase and understand context
2. **Plan**: Create detailed implementation plan
3. **Code**: Implement with TDD approach
4. **Commit**: Commit working, tested code

---

_This file is the single source of truth for project conventions._
_All developers and AI agents must follow these rules._
