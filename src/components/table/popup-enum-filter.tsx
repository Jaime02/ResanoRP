import { FunnelIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { translatedEnums } from "@/lib/translations";

interface PopupEnumFilterProps {
  enumName: keyof typeof translatedEnums;
  filterFieldName: string;
  activeEnumValues?: Array<string>;
  handleChange: (newValue: Array<string> | null) => void;
}

export default function PopupEnumFilter({
  enumName,
  filterFieldName,
  activeEnumValues,
  handleChange,
}: PopupEnumFilterProps) {
  const enumTranslated = translatedEnums[enumName];

  return (
    <div data-testid={`popup-enum-filter-${filterFieldName}`} className="flex flex-row gap-1">
      <Popover>
        <PopoverTrigger variant="secondary" size="icon">
          <FunnelIcon />
        </PopoverTrigger>
        <PopoverContent side="top">
          {Object.entries(enumTranslated).map(([value, label], index) => (
            <Label key={index}>
              <Checkbox
                testId={`checkbox-filter-${filterFieldName}-${value}`}
                checked={activeEnumValues ? activeEnumValues.includes(value) : false}
                onCheckedChange={(checked) => {
                  let newValues = activeEnumValues ? [...activeEnumValues] : [];
                  if (checked) {
                    if (!newValues.includes(value)) {
                      newValues.push(value);
                    }
                  } else {
                    newValues = newValues.filter((v) => v !== value);
                  }
                  handleChange(newValues);
                }}
              />
              {label}
            </Label>
          ))}
        </PopoverContent>
      </Popover>
      {activeEnumValues &&
        activeEnumValues.length !== 0 &&
        activeEnumValues.length !== Object.keys(enumTranslated).length && (
          <Button
            testId={`button-clear-filter-${filterFieldName}`}
            size="icon"
            variant="destructive"
            onClick={() => handleChange(null)}
          >
            <XIcon />
          </Button>
        )}
    </div>
  );
}
