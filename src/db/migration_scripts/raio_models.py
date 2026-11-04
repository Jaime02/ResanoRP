from dataclasses import dataclass
from datetime import datetime


@dataclass
class RaioPart:
    ref: str
    path: str | None
    material_quality: str | None
    material_dimension: str | None
    coating: str | None


@dataclass
class RaioCoating:
    coating: str


@dataclass
class RaioCaracteristica:
    part_id: int
    char: str


@dataclass
class RaioProductionOrder:
    id: int
    machine: str | None
    client: str
    spod: str
    reference: str
    quantity: int
    description: str | None
    date_order: datetime | None
    date_finish: datetime | None
    date_deliver: datetime | None
    observations: str | None
    counter: int | None
    assigned: str | None
    importance: int | None
    finishid: int | None
    bool_done: int
    coating_status: int | None


@dataclass
class RaioMaterial:
    quality: str
