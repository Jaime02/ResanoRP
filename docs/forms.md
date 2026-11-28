# Forms

Forms are built with TanStack Form through `useAppForm` (`src/form/`). Each form hook passes its schema as `validators.onChange`. The rules below keep the behaviour the same in every form.

## Validation runs on change

Validation runs when a value changes, never only on submit. A form that is invalid has its submit button disabled (`ButtonSubmit` in `src/form/fields/button-submit.tsx`), so the user cannot submit it and the server never sees the invalid values.

Use `validators: { onChange: schema }`. Do not use `onSubmit` or `onMount` validators for the schema: a submit validator only runs after the button is pressed, and an error from a mount validator stays on a field that is never changed by hand.

Tests follow from this. Do not click submit to make errors appear. Assert the disabled button and the marked fields instead (see [Tests](#tests)).

## Errors show after the field is touched

A field marked invalid (`data-invalid` on its container, from `FieldLayoutContainer`) gets a red border. The error text appears only once the field has been touched (`FieldLayout`). The mark comes only from the schema: there is no separate "required and empty" check, so the mark and the submit button always agree.

## Required fields

`isFieldRequired(fieldName, schema)` in `src/form/utils.tsx` reads the asterisk from the schema. A field is required when the schema rejects an empty value, so do not pass `required` by hand.

## Reset the form with `resetForm`

Use `resetForm(form)` from `src/form/utils.tsx`, not `form.reset()`. A reset clears every error and validates nothing, so the empty form would look valid until the first change. `resetForm` validates straight after the reset.

## The form checks itself again

Errors are computed on change only, so two cases need a new check:

- **A field appears.** TanStack Form drops a field's errors when the field unmounts, so a dialog that opens shows its fields without marks. `ButtonSubmit` and `FormContextProvider` call `useValidateForm` (`src/form/hooks/use-validate-form.ts`), which runs the check whenever they mount. A dialog's submit button mounts with its fields, so the marks show when it opens and after it is closed and reopened.
- **The schema changes.** A form that switches between two schemas (for example the "line without part" checkbox in the sell-order and delivery-note lines) gets the new schema in a layout effect of its parent, after its children have run their effects. `useValidateForm` runs as a passive effect and depends on the schema, so it checks the form again after the switch.

A field that is hidden by a switch must not keep its errors, or they block the submission. Reset it with `form.resetField(name)` when it is hidden (see `useCreateSellOrderLineForm`).

## Tests

Use the helpers in `src/tests/utils/components/form.ts`:

- `getInvalidFields(container)` returns the marked fields of a form or dialog.
- `assertFormSchemaErrors(container, schema, values)` checks that the schema rejects the values, that each rejected field is marked (`data-field-name`), and that the submit button is disabled.

Field names in the test and in the schema must be the same paths, because the marks are matched by `data-field-name`.

## Known behaviour

- A combobox moves the focus to the next field after an item is picked (`finalFocus` in `src/components/ui/combobox.tsx`). It applies to every combobox, including the filters of the tables. The table filters have not been checked for this.
