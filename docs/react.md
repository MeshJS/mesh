# React Guidelines

## Performance

Note that the below are purely optimizations so any code should still function without them.

### Use `memo` to skip re-rendering child components when the props are unchanged

React normally re-renders a component whenever its parent re-renders.

Using [memo](https://react.dev/reference/react/memo) will create a "memoized" component that React will not re-render when its parent re-renders, assuming the props are unchanged.

If a component has array or object properties, consider using `useMemo` in the parent component as detailed below.

```typescript
const Greeting = memo(function Greeting({ name }) {
  return <h1>Hello, {name}!</h1>;
});

export default Greeting;
```

### Use `useMemo` to cache values between re-renders

The [useMemo](https://react.dev/reference/react/useMemo) hook caches a calculation result between re-renders until its dependencies change.

The most common use case is ensuring object or array properties can retain the same reference and therefore prevent unnecessary re-renders since React does a shallow comparison on component and hook properties.

While the scenario is rare, expensive recalculation such as iterating large arrays or very complex math can also be avoided, by ensuring it is only executed when the dependencies change.

This can also be achieved via `useEffect` and `useState` however this is not advised since:

- More code is required.
- Readability is reduced since the intent is less explicit.
- An additional render is required to generate the first value since `useEffect` callbacks are evaluated after the render rather than during it.

🚫

```typescript
export function TodoList({ todos }) {
  const visibleTodos = filterTodos(todos);

  return (
    <div>
      <List items={visibleTodos} />
    </div>
  );
}
```

🚫

```typescript
export function TodoList({ todos }) {
  const [visibleTodos, setVisibleTodos] = useState();

  useEffect(() => setVisibleTodos(filterTodos(todos)), [todos]);

  return (
    <div>
      <List items={visibleTodos} />
    </div>
  );
}
```

✅

```typescript
export function TodoList({ todos }) {
  const visibleTodos = useMemo(() => filterTodos(todos), [todos]);

  return (
    <div>
      <List items={visibleTodos} />
    </div>
  );
}
```

### Use `useCallback` to cache functions between re-renders

The [useCallback](https://react.dev/reference/react/useCallback) hook serves exactly the same purpose as `useMemo` but is specifically for functions.

It can also prevent unnecessary re-renders by ensuring a reference to a function prop, such as `onClick`, is only changed when the dependencies change.

🚫

```typescript
function ProductPage({ productId, referrer }) {
  const handleSubmit = (orderDetails) => {
    post('/product/' + productId + '/buy', {
      referrer,
      orderDetails,
    });
  };

  return (
    <div>
      <ShippingForm onSubmit={handleSubmit} />
    </div>
  );
}
```

🚫

```typescript
function ProductPage({ productId, referrer }) {
  const handleSubmit = useMemo(() => {
    return (orderDetails) => {
      post('/product/' + productId + '/buy', {
        referrer,
        orderDetails,
      });
    };
  }, [productId, referrer]);

  return (
    <div>
      <ShippingForm onSubmit={handleSubmit} />
    </div>
  );
}
```

✅

```typescript
function ProductPage({ productId, referrer }) {
  const handleSubmit = useCallback(
    (orderDetails) => {
      post('/product/' + productId + '/buy', {
        referrer,
        orderDetails,
      });
    },
    [productId, referrer],
  );

  return (
    <div>
      <ShippingForm onSubmit={handleSubmit} />
    </div>
  );
}
```