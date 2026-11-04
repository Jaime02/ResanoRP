import type { NumberInputProps } from "@/components/ui/number-input";
import NumberInput from "@/components/ui/number-input";

export type PriceInputProps = NumberInputProps;

export default function PriceInput(props: PriceInputProps) {
  return <NumberInput suffix=" €" decimalScale={3} minDecimalScale={2} {...props} />;
}
