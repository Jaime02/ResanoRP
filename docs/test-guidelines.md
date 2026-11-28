# Test guidelines

Lessons from e2e failures that only showed up on CI. The rules for writing tests are in `CLAUDE.md`.

## A popup reacts to input before its first frame

### What happened

`manage multi-level part sets` failed once on CI. It pressed Escape to close the blueprint dialog that the part-set tooltip opens, and the dialog stayed open. It never failed locally, not even with the browser's CPU throttled 6×.

### Why

Base UI does two things one animation frame after a popup opens:

- it moves focus into the popup (`enqueueFocus` → `requestAnimationFrame`)
- it removes `data-starting-style`

CI runners have no GPU, so frames come late, and Playwright can press a key before that frame. The CI call log shows it: the dialog still had `data-starting-style` when Escape was pressed.

Focus was still on the tooltip's button, so the tooltip handled the Escape first. Its `onOpenChange` ignored the close because the dialog was open. Base UI's `useDismiss` treats an ignored close as handled: it calls `event.stopPropagation()`, and the dialog's `keydown` listener on `document` never receives the key.

### Rules for app code

- **Don't ignore the close of an open popup in `onOpenChange`.** An ignored close still swallows the event behind it. If one popup must not close while another is open, reshape the state so both are never open together. Alternatively, nest the second popup inside the first one's React tree, which lets Base UI decide which one is on top.
- **Keep one popup open at a time when one opens another.** `TooltipPartSet` closes the tooltip when the dialog opens and reopens it pinned when the dialog closes.
- **Model which popup is open as one enum** (`PartSetView`), not as several booleans that can disagree. A popup that its `open` prop has closed can still call `onOpenChange` (the tooltip reports the end of its hover once the dialog covers it). So each popup's handler changes the view only while that popup is the one shown.
- **Use props to change how a popup behaves.** To keep the tooltip open with the pointer away, it gets `openOnHover={false}`. Its hover close isn't ignored.

### Reproducing frame races

CDP CPU throttling (`Emulation.setCPUThrottlingRate`) doesn't reproduce them. It slows the page's JavaScript, the test's checks included, so the window between "visible" and "first frame" doesn't grow. Delay the frames instead, in a throwaway test that you don't commit (it breaks the "drive tests through the UI" rule):

```ts
await page.evaluate(() => {
  window.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 1000)) as typeof window.requestAnimationFrame;
});
await button.click();
await page.keyboard.press("Escape"); // lands before the popup's first frame
```

Run it before and after the fix: with the race, it fails every time.

## A test leaves files behind on disk

Every test cleans and reseeds the database. Files on disk are restored only for tests annotated with `TestAnnotations.ResetBlueprints`. Deleting a part moves its blueprint files to the archive, so a test that deletes a part with blueprints needs that annotation. Without it, the test passes when it runs alone or last in its file, and fails on any rerun.

To check that a test is independent, run it several times **in separate processes**. `--repeat-each` reuses the worker, so module-level state also leaks between repeats:

```sh
for i in $(seq 1 10); do
  node --env-file=./envs/.env.test ./node_modules/@playwright/test/cli.js test src/tests/e2e/<file>.test.ts -g "<title>" --workers=1 --reporter=line | grep -E "passed|failed"
done
```

## A route in a test context turns off the HTTP cache

### What happened

`trackAuditedMutations` routed every tRPC request so the audit checks could read the request bodies. Playwright turns off the browser's HTTP cache for a whole context once it has a route, so every page load downloaded about 2.3 MB of JavaScript again. Page loads took about 157 ms on average; without the route they took about 87 ms.

### Rules for test code

- **Route only the requests a test needs to change or inspect.** A route on one URL pattern still disables the cache for the whole context.
- **Put the route in the helper that needs it, once per context.** Keep a `WeakSet` of contexts that are already routed, so a helper called again does not add a second route.
- **Measure before you optimize a test.** Record each step's category (hook, fixture, action, assertion) with a reporter, and compare before and after runs interleaved, not back to back. Most of the time in this suite was in assertion waits and clicks, not in setup or resets.

## Wait for the server before saving state it reads from a cookie

### What happened

The server takes the admin role only from its httpOnly session cookie. The app saved the new user mode first and then called the logout. A navigation that followed aborted the logout request, so the browser showed another mode while the server still had the admin session.

### Rules for app code

- **Save the cookie-backed state only after the server has answered the request that changes it.** If the request fails, keep the old state and show an error.
- **Ignore new picks while that request is pending.** Otherwise a second pick sends a second logout.

## Fail one request of a batch in a test

### What happened

Aborting every server-function POST made the client's own log request fail too, so the logged error the test expects was never recorded.

### Rules for test code

- **Abort only the request the test is about.** Use a flag so that the route aborts the first matching request and lets the rest through.
- **Unroute the request once the test has checked the result,** so later steps in the same test are not affected.
