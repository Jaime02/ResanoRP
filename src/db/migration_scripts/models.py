from dataclasses import dataclass


@dataclass
class Shape:
    name: str


@dataclass
class DeliveryMethod:
    name: str


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
