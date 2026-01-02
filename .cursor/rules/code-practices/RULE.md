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

