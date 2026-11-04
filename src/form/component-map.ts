import ButtonSubmit from "@/form/fields/button-submit";
import FieldCheckbox from "@/form/fields/checkbox";
import FieldClientCombobox from "@/form/fields/client-combobox";
import FieldCoatingCombobox from "@/form/fields/coating-combobox";
import FieldDateInput from "@/form/fields/date-input";
import FieldDecimalInput from "@/form/fields/decimal-input";
import FieldDeliveryMethodCombobox from "@/form/fields/delivery-method-combobox";
import FieldFilesInput from "@/form/fields/file-input";
import FieldNumberInput from "@/form/fields/number-input";
import FieldPaymentMethodCombobox from "@/form/fields/payment-method-combobox";
import FieldPickerPart from "@/form/fields/picker-part";
import FieldPriceInput from "@/form/fields/price-input";
import FieldRawMaterialCombobox from "@/form/fields/raw-material-combobox";
import FieldShapeCombobox from "@/form/fields/shape-combobox";
import FieldTextInput from "@/form/fields/text-input";
import FieldTextareaInput from "@/form/fields/textarea-input";
import FieldWidthInput from "@/form/fields/width-input";

export const fieldComponents = {
  Checkbox: FieldCheckbox,
  ClientCombobox: FieldClientCombobox,
  CoatingCombobox: FieldCoatingCombobox,
  DateInput: FieldDateInput,
  DecimalInput: FieldDecimalInput,
  DeliveryMethodCombobox: FieldDeliveryMethodCombobox,
  FilesInput: FieldFilesInput,
  NumberInput: FieldNumberInput,
  PaymentMethodCombobox: FieldPaymentMethodCombobox,
  PickerPart: FieldPickerPart,
  PriceInput: FieldPriceInput,
  ShapeCombobox: FieldShapeCombobox,
  RawMaterialCombobox: FieldRawMaterialCombobox,
  TextInput: FieldTextInput,
  TextareaInput: FieldTextareaInput,
  WidthInput: FieldWidthInput,
};

export const formComponents = {
  ButtonSubmit,
};
