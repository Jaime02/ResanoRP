from dataclasses import dataclass


@dataclass
class Shape:
    name: str


@dataclass
class DeliveryMethod:
    name: str


@dataclass
class Printer:
    name: str
    address: str
    # The values of PrinterKind in src/types/printer.ts
    kind: str = "ipp"
    share_name: str | None = None
    username: str | None = None
    password: str | None = None
    label_width_mm: int | None = None
    label_length_mm: int | None = None
    # Part tags are only offered the printers for tags
    for_tags: bool = False


@dataclass
class Machine:
    name: str
    min_diameter: int | None = None
    max_diameter: int | None = None


@dataclass
class Material:
    id: int
    width: int
    shapeId: int
    rawMaterialId: int
