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
