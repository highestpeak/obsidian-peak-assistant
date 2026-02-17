# React Event Handlers and Dependency Management

## Event Handler Best Practices

When writing event handlers in React components:

1. **Prefer simple async functions over useCallback when possible**
   - If the handler only needs to read from store/context, use a simple async function
   - Avoid useCallback unless there's a specific performance reason (e.g., passing to memoized child components)

2. **Use store.getState() inside handlers to avoid dependencies**
   - Instead of: `useCallback(() => { ... }, [activeConversation, manager])`
   - Prefer: `const handleAction = async () => { const data = useStore.getState().data; ... }`
   - This avoids dependency arrays and potential circular dependency issues

3. **Only include minimal dependencies when necessary**
   - If you must use useCallback, only include the minimal necessary dependencies
   - Prefer specific values (e.g., `conversationId`) over entire objects (e.g., `conversation`)
   - Example: `useCallback(() => {...}, [conversationId])` instead of `useCallback(() => {...}, [conversation])`

4. **Avoid useRef for storing store values**
   - Don't use useRef + useEffect to sync store values
   - Instead, directly call `store.getState()` inside the handler when needed

## Examples

**Good:**
```typescript
const handleRegenerate = async () => {
  const conversation = useProjectStore.getState().activeConversation;
  if (!conversation) return;
  await manager.regenerateConversationTitle(conversation.meta.id);
};
```

**Bad:**
```typescript
const handleRegenerate = useCallback(async () => {
  await manager.regenerateConversationTitle(activeConversation.meta.id);
}, [activeConversation, manager]);
```

**Also Bad:**
```typescript
const ref = useRef(activeConversation);
useEffect(() => { ref.current = activeConversation; }, [activeConversation]);
const handleRegenerate = useCallback(async () => {
  await manager.regenerateConversationTitle(ref.current.meta.id);
}, []);
```

# Coding Standard: Eliminate Arrow Code & Deep Nesting

## Core Principle: "Flat is better than nested"
Strictly avoid the "Arrow Anti-pattern" (deeply nested if-statements). Always prioritize code readability by keeping the main logic at the minimum indentation level.

## Guidelines for Logic Structuring
1. **Early Returns (Guard Clauses):** If a condition needs to be met for the function to proceed, check for the *inverse* and return/throw immediately.
   - ❌ **Anti-pattern:** `if (condition) { /* 50 lines of code */ } else { return error; }`
   - ✅ **Best Practice:** `if (!condition) return error; /* 50 lines of code */`

2. **No Redundant Else:** If an `if` block ends with `return`, `break`, `continue`, or `throw`, do **not** use an `else` block. Continue the logic on the next line.

3. **Maximum Nesting Depth:** Aim for a maximum of 2 levels of nesting. If you hit 3 levels, refactor using guard clauses or extract logic into a helper function.

## Examples

### ❌ Bad (Arrow Code)
function saveProfile(user) {
    if (user != null) {
        if (user.hasValidEmail()) {
            if (user.canSave()) {
                // Main business logic nested deep inside
                return database.save(user);
            } else {
                throw new Error("Cannot save");
            }
        }
    }
}

### ✅ Good (Flattened with Guard Clauses)
function saveProfile(user) {
    if (!user) return;
    if (!user.hasValidEmail()) return;
    if (!user.canSave()) throw new Error("Cannot save");

    // Main business logic stays at the root level
    return database.save(user);
}

## Execution
Apply these rules automatically when generating new functions or refactoring existing code. If you see a nested 'if-else' structure, flatten it using the Early Return pattern.