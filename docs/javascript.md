# JavaScript Guidelines

## Use a verb phrase for function/method names

When naming a function or method, describe the action, not the outcome.

🚫

```javascript
function formattedChangelog() {
  // ...
}
```

✅

```javascript
function formatChangelog() {
  // ...
}
```

For a function or method that returns a boolean, reword the name to start with a descriptive verb (e.g. `getNOUN` as opposed to `isSTATE`) so that it doesn't collide with a variable that shares its name, which would trigger the ESLint `no-shadow` rule:

🚫

```javascript
function isEIP1559Compatible() {
  // ...
}

const isEIP1559Compatible = isEIP1559Compatible();
```

✅

```javascript
function getEIP1559Compatibility() {
  // ...
}

const isEIP1559Compatible = getEIP1559Compatibility();
```

### Read more

- [Google's JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html#naming-method-names)
- [.NET Fundamentals](https://docs.microsoft.com/en-us/dotnet/standard/design-guidelines/names-of-type-members#names-of-methods)
- [Kotlin Coding Conventions](https://kotlinlang.org/docs/coding-conventions.html#choose-good-names)
- [Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/#strive-for-fluent-usage)

## Use a verb phrase for boolean variable names that do not involve secondary objects

Sometimes a variable that is intended to hold a boolean value does not have an explicit subject, but represents the context where the variable is defined (e.g., a class or an entire file). When naming such a variable, use a statement that describes the state of the subject, minus the name of the subject itself. Usually this means prefixing the name with a form of "to be" or "to have" (e.g. `is*`, `has*`), but you may find it more readable to use past or future tense and/or a modal verb such as `should`.

🚫

```javascript
const removed = false;
```

✅

```javascript
// Any of these would do
const isRemoved = false;
const wasRemoved = false;
const hasBeenRemoved = false;
const shouldBeRemoved = false;
```

If the name represents a negative statement, reword it into a positive statement and inverting the value assigned to the value.

🚫

```javascript
const notEnoughGas = false;
```

✅

```javascript
const hasEnoughGas = true;
```

Take special note of variables which are created via React's `useState` hook.

🚫

```javascript
const [removed, setRemoved] = useState(false);
```

✅

```javascript
const [isRemoved, setIsRemoved] = useState(false);
```

## 💡 Place names of secondary concepts first in boolean variable names

When naming a boolean variable that includes a subject, the previous guideline suggests that you can place the verb at the beginning:

```javascript
const isRecipientOwnedAccount = Boolean(ownedAccountName);
```

However, this naming strategy creates a point of friction for objects, arrays, or React components, where it may be desirable to sort identifiers alphabetically. In that case you could end up with something like:

```jsx
<SenderToRecipient
  isRecipientOwnedAccount={isRecipientOwnedAccount}
  onClick={onClick}
  recipientName={toName}
  recipientNickname={toNickname}
  senderAddress={fromAddress}
  senderName={fromName}
/>
```

It is potentially easier to read if properties that concern the same concept are kept together instead of separate. To address this, you may wish to place the subject of the variable name at the beginning:

```javascript
const recipientIsOwnedAccount = Boolean(ownedAccountName);
```

This would result in:

```jsx
<SenderToRecipient
  recipientIsOwnedAccount={isRecipientOwnedAccount}
  recipientName={toName}
  recipientNickname={toNickname}
  onClick={onClick}
  senderAddress={fromAddress}
  senderName={fromName}
/>
```

## Use `async`/`await` syntax over `.then`/`.catch`

Asynchronous code written using `async`/`await` syntax looks less complex and more straightforward than code written using `.then`/`.catch`. Additionally, using `async`/`await` leads to [better stack traces in Node and Chromium](https://mathiasbynens.be/notes/async-stack-traces), both of which use the V8 JavaScript engine, because when an asynchronous operation is `await`ed, the engine will remember the function where the `await` occurred, which means that it can place that function on the stack trace (otherwise, using `.then`/`.catch`, it would get lost).

🚫

```javascript
function makeRequest() {
  return fetch('https://google.com').then((response) => {
    return response.json().then((json) => {
      return json['page_views'];
    });
  });
}
```

✅

```javascript
async function makeRequest() {
  const response = await fetch('https://google.com');
  const json = await response.json();
  return json['page_views'];
}
```

## `await` promises before returning them

An `async` function that returns a rejected promise created via another `async` function may disappear from the stack trace. This is solved by `await`ing the promise before returning it.

<details><summary><b>Read more</b></summary>
<br/>
<p>If you save the following to a file (say, <code>/tmp/example.js</code>) and run it with <code>node</code>:</p>

```javascript
async function foo() {
  return bar();
}

async function bar() {
  await Promise.resolve();
  throw new Error('BEEP BEEP');
}

foo().catch((error) => console.log(error.stack));
```

then you will see the following in the terminal (as of Node 18):

```
Error: BEEP BEEP
    at bar (/private/tmp/example.js:7:9)
```

Notice how `foo` is completely missing from the stack trace!

However, if you put an `await` before the call to `bar`:

```javascript
async function foo() {
  return await bar();
}

async function bar() {
  await Promise.resolve();
  throw new Error('BEEP BEEP');
}

foo().catch((error) => console.log(error.stack));
```

you will now see it at the bottom of the stack trace:

```
Error: BEEP BEEP
    at bar (/private/tmp/example.js:7:9)
    at async foo (/private/tmp/example.js:2:10)
```

</details>

🚫

```javascript
async function makeRequest() {
  const response = await fetch('https://some/url');
  return response.json();
}
```

✅

```javascript
async function makeRequest() {
  const response = await fetch('https://some/url');
  return await response.json();
}
```