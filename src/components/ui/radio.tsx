import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";

interface RadioButtonProps extends React.ComponentProps<typeof Radio.Root> {
  testId?: string;
  children?: React.ReactNode;
}

function RadioButton({ testId, children, ...props }: RadioButtonProps) {
  return (
    <Radio.Root
      data-testid={testId}
      className="flex size-5 items-center justify-center rounded-full focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/70 data-checked:bg-primary data-unchecked:border data-unchecked:border-black"
      {...props}
    >
      <Radio.Indicator className="flex before:size-2 before:rounded-full before:bg-gray-50 data-unchecked:hidden" />
      {children}
    </Radio.Root>
  );
}

export { RadioGroup, RadioButton };
